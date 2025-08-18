import { EventEmitter } from 'events';
import type { ProgressCallback, FileInfo } from './types.js';
import { ShellError } from './errors.js';
import { getFileInfo, resolvePath, createPathMatcher, joinPaths } from './utils.js';

export interface PipelineOptions {
  readonly parallel?: number;
  readonly failFast?: boolean;
  readonly dryRun?: boolean;
  readonly verbose?: boolean;
}

export interface PipelineStep<TInput, TOutput> {
  name: string;
  execute(input: TInput): Promise<TOutput> | TOutput;
  condition?(input: TInput): boolean;
}

export interface TransformStep<T> extends PipelineStep<T, T> {
  type: 'transform';
}

export interface FilterStep<T> extends PipelineStep<T, boolean> {
  type: 'filter';
}

export interface MapStep<TInput, TOutput> extends PipelineStep<TInput, TOutput> {
  type: 'map';
}

export type AnyPipelineStep<T> = TransformStep<T> | FilterStep<T> | MapStep<T, unknown>;

export class Pipeline<T = string> extends EventEmitter {
  protected steps: AnyPipelineStep<unknown>[] = [];
  protected readonly options: PipelineOptions;
  protected readonly shellInstance: unknown;

  constructor(shellInstance: unknown, options: PipelineOptions = {}) {
    super();
    this.shellInstance = shellInstance;
    this.options = {
      parallel: 4,
      failFast: true,
      dryRun: false,
      verbose: false,
      ...options
    };
  }

  public transform<U>(fn: (input: T) => U | Promise<U>, name?: string): Pipeline<U> {
    const step: AnyPipelineStep<unknown> = {
      type: 'transform' as const,
      name: name ?? `transform-${this.steps.length}`,
      execute: fn as (input: unknown) => unknown | Promise<unknown>
    };
    
    this.steps.push(step);
    return this as unknown as Pipeline<U>;
  }

  public filter(predicate: (input: T) => boolean | Promise<boolean>, name?: string): Pipeline<T> {
    const step: FilterStep<T> = {
      type: 'filter',
      name: name ?? `filter-${this.steps.length}`,
      execute: predicate
    };
    
    this.steps.push(step as AnyPipelineStep<unknown>);
    return this;
  }

  public map<U>(fn: (input: T) => U | Promise<U>, name?: string): Pipeline<U> {
    const step: MapStep<T, U> = {
      type: 'map',
      name: name ?? `map-${this.steps.length}`,
      execute: fn
    };
    
    this.steps.push(step as AnyPipelineStep<unknown>);
    return this as unknown as Pipeline<U>;
  }

  public parallel(concurrency: number): Pipeline<T> {
    (this.options as any).parallel = concurrency;
    return this;
  }

  public progress(callback: ProgressCallback): Pipeline<T> {
    this.on('progress', callback);
    return this;
  }

  public async execute(input: T[] | T): Promise<any[]> {
    const inputs = Array.isArray(input) ? input : [input];
    
    if (this.options.dryRun) {
      this.emit('dryRun', {
        steps: this.steps.map(s => s.name),
        inputs: inputs.length,
        options: this.options
      });
      return inputs;
    }

    return await this.executeSteps(inputs);
  }

  private async executeSteps(inputs: unknown[]): Promise<any[]> {
    let currentData = inputs;
    
    // If no steps, just emit progress for the passthrough
    if (this.steps.length === 0) {
      this.emit('progress', inputs.length, inputs.length);
      return currentData as any;
    }
    
    for (let stepIndex = 0; stepIndex < this.steps.length; stepIndex++) {
      const step = this.steps[stepIndex]!;
      
      if (this.options.verbose) {
        this.emit('stepStart', { step: step.name, inputs: currentData.length });
      }

      try {
        currentData = await this.executeStep(step, currentData, stepIndex);
        
        if (this.options.verbose) {
          this.emit('stepComplete', { step: step.name, outputs: currentData.length });
        }
      } catch (error) {
        this.emit('stepError', { step: step.name, error });
        
        if (this.options.failFast) {
          // Preserve the original error code if it's a ShellError
          const errorCode = (error as any).code || 'INVALID_OPERATION';
          throw new ShellError(
            `Pipeline failed at step '${step.name}': ${error instanceof Error ? error.message : String(error)}`,
            errorCode,
            'pipeline',
            undefined,
            undefined,
            undefined,
            { step: step.name, error }
          );
        }
      }
    }

    return currentData as any;
  }

  private async executeStep(
    step: AnyPipelineStep<unknown>,
    inputs: unknown[],
    _stepIndex: number
  ): Promise<unknown[]> {
    const concurrency = this.options.parallel ?? 4;
    const results: unknown[] = [];
    const errors: Error[] = [];
    
    if (concurrency === 1 || inputs.length === 1) {
      // Sequential execution
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        
        try {
          const result = await this.executeStepOnInput(step, input);
          
          if (step.type === 'filter') {
            if (result) {
              results.push(input);
            }
          } else {
            results.push(result);
          }
        } catch (error) {
          errors.push(error as Error);
          if (this.options.failFast) break;
        }
        
        this.emit('progress', i + 1, inputs.length);
      }
    } else {
      // Parallel execution
      const chunks = this.chunkArray(inputs, concurrency);
      
      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async (input, index) => {
          try {
            const result = await this.executeStepOnInput(step, input);
            return { success: true, result, input, index };
          } catch (error) {
            return { success: false, error, input, index };
          }
        });
        
        const chunkResults = await Promise.all(chunkPromises);
        
        for (const chunkResult of chunkResults) {
          if (chunkResult.success) {
            if (step.type === 'filter') {
              if (chunkResult.result) {
                results.push(chunkResult.input);
              }
            } else {
              results.push(chunkResult.result);
            }
          } else {
            errors.push(chunkResult.error as Error);
            if (this.options.failFast) break;
          }
        }
        
        if (this.options.failFast && errors.length > 0) break;
        
        this.emit('progress', results.length, inputs.length);
      }
    }

    if (errors.length > 0 && this.options.failFast) {
      throw errors[0];
    }

    return results;
  }

  private async executeStepOnInput(step: AnyPipelineStep<unknown>, input: unknown): Promise<unknown> {
    if (step.condition && !step.condition(input)) {
      return step.type === 'filter' ? false : input;
    }

    return await step.execute(input);
  }

  private chunkArray<U>(array: U[], size: number): U[][] {
    const chunks: U[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

export class FilePipeline extends Pipeline<string> {
  constructor(shellInstance: unknown, options: PipelineOptions = {}) {
    super(shellInstance, options);
  }

  protected get shell(): any {
    return (this as any).shellInstance;
  }

  public find(pattern: string): FilePipeline {
    const matcher = createPathMatcher(pattern);
    return this.filter(path => {
      // Extract filename from full path for matching
      const filename = path.split(/[/\\]/).pop() || path;
      return matcher(filename);
    }, `find-${pattern}`) as FilePipeline;
  }

  public filterBySize(minSize?: number, maxSize?: number): FilePipeline {
    return this.filter(async (path: string) => {
      try {
        const info = await getFileInfo(path);
        if (minSize !== undefined && info.size < minSize) return false;
        if (maxSize !== undefined && info.size > maxSize) return false;
        return true;
      } catch {
        return false;
      }
    }, 'filterBySize') as FilePipeline;
  }

  public filterByType(type: 'file' | 'directory' | 'symlink' | string[] | string): FilePipeline {
    return this.filter(async (path: string) => {
      try {
        const info = await getFileInfo(path);
        
        // Handle array of extensions
        if (Array.isArray(type)) {
          if (!info.isFile) return false;
          const filename = path.split(/[/\\]/).pop() || '';
          const ext = filename.split('.').pop()?.toLowerCase() || '';
          return type.some(t => t.toLowerCase() === ext);
        }
        
        // Handle single extension
        if (typeof type === 'string' && !['file', 'directory', 'symlink'].includes(type)) {
          if (!info.isFile) return false;
          const filename = path.split(/[/\\]/).pop() || '';
          const ext = filename.split('.').pop()?.toLowerCase() || '';
          return ext === type.toLowerCase();
        }
        
        // Handle standard file system types
        switch (type) {
          case 'file': return info.isFile;
          case 'directory': return info.isDirectory;
          case 'symlink': return info.isSymlink;
          default: return false;
        }
      } catch {
        return false;
      }
    }, `filterBy-${Array.isArray(type) ? type.join(',') : type}`) as FilePipeline;
  }

  public filterByAge(olderThan?: Date, newerThan?: Date): FilePipeline {
    return this.filter(async (path: string) => {
      try {
        const info = await getFileInfo(path);
        if (olderThan && info.mtime > olderThan) return false;
        if (newerThan && info.mtime < newerThan) return false;
        return true;
      } catch {
        return false;
      }
    }, 'filterByAge') as FilePipeline;
  }

  public rename(fn: (filename: string) => string): FilePipeline {
    return this.transform(async (path: string) => {
      const resolvedPath = resolvePath(path);
      const info = await getFileInfo(resolvedPath);
      
      if (!info.isFile) return path;
      
      const parts = resolvedPath.split(/[\\/]/);
      const filename = parts[parts.length - 1]!;
      const newFilename = fn(filename);
      
      if (newFilename !== filename) {
        parts[parts.length - 1] = newFilename;
        const newPath = parts.join(process.platform === 'win32' ? '\\' : '/');
        
        // Actually rename the file with __internal flag to ensure errors are thrown
        await this.shell.move(resolvedPath, newPath, { __internal: true } as any);
        return newPath;
      }
      
      return path;
    }, 'rename') as FilePipeline;
  }

  public moveTo(destination: string): FilePipeline {
    return this.transform(async (path: string) => {
      const resolvedDest = resolvePath(destination);
      const filename = path.split(/[/\\]/).pop() || '';
      const destPath = joinPaths(resolvedDest, filename);
      await this.shell.move(path, destPath);
      return destPath;
    }, `moveTo-${destination}`) as FilePipeline;
  }

  public copyTo(destination: string, options?: { preserve?: boolean; noClobber?: boolean }): FilePipeline {
    return this.transform(async (path: string) => {
      const resolvedDest = resolvePath(destination);
      const filename = path.split(/[/\\]/).pop() || '';
      const destPath = joinPaths(resolvedDest, filename);
      // Pass __internal flag to ensure errors are thrown
      await this.shell.copy(path, destPath, { ...options, __internal: true } as any);
      return destPath; // Return new path after copy
    }, `copyTo-${destination}`) as FilePipeline;
  }

  public remove(options?: { force?: boolean; trash?: boolean }): FilePipeline {
    return this.transform(async (path: string) => {
      await this.shell.remove(path, { recursive: true, ...options });
      return path;
    }, 'remove') as FilePipeline;
  }

  public compress(algorithm: 'gzip' | 'zip' = 'gzip'): FilePipeline {
    return this.transform(async (path: string) => {
      const compressedPath = `${path}.${algorithm === 'gzip' ? 'gz' : 'zip'}`;
      
      // This would need to be implemented based on the compression library
      // For now, return the original path
      return compressedPath;
    }, `compress-${algorithm}`) as FilePipeline;
  }

  public getInfo(): Pipeline<FileInfo> {
    return this.map(async (path: string) => {
      return await getFileInfo(path);
    }, 'getInfo');
  }
}

export class TextPipeline extends Pipeline<string> {
  constructor(shellInstance: unknown, options: PipelineOptions = {}) {
    super(shellInstance, options);
  }

  protected get shell(): any {
    return (this as any).shellInstance;
  }

  // Override execute to handle text operations on the entire input array
  public async execute(input: string[] | string): Promise<string[]> {
    const inputs = Array.isArray(input) ? input : [input];
    
    if (this.options.dryRun) {
      this.emit('dryRun', {
        steps: this.steps.map(s => s.name),
        inputs: inputs.length,
        options: this.options
      });
      return inputs;
    }

    // For text operations, process the entire array as one unit
    let currentData: string[] = inputs;
    
    let hasNonTransformOps = false;
    let hasSingleWrappingTransform = false;
    
    for (const step of this.steps) {
      if (step.type === 'transform') {
        // Transform steps in TextPipeline process the entire array at once
        const result = await step.execute(currentData) as any;
        
        // Check if this is a wrapping transform that returns [value]
        if (Array.isArray(result) && result.length === 1) {
          // This is a wrapping transform step - unwrap for processing
          currentData = result[0];
          // Track if this is the only operation
          if (this.steps.length === 1) {
            hasSingleWrappingTransform = true;
          }
        } else {
          currentData = result;
        }
      } else if (step.type === 'filter') {
        currentData = currentData.filter(item => step.execute(item) as boolean);
        hasNonTransformOps = true;
      } else if (step.type === 'map') {
        const results = await Promise.all(currentData.map(item => step.execute(item)));
        currentData = results as string[];
        hasNonTransformOps = true;
      }
    }
    
    // Only wrap if there's a single wrapping transform and no other operations
    return hasSingleWrappingTransform ? [currentData] as any : currentData;
  }

  public grep(pattern: string | RegExp, options?: { ignoreCase?: boolean; invert?: boolean }): TextPipeline {
    const regex = typeof pattern === 'string' 
      ? new RegExp(pattern, options?.ignoreCase ? 'i' : '')
      : pattern;
    
    return this.filter((line: string) => {
      const matches = regex.test(line);
      return options?.invert ? !matches : matches;
    }, `grep-${pattern}`) as TextPipeline;
  }

  public sed(pattern: string | RegExp, replacement: string): TextPipeline {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'g') : pattern;
    
    return this.map((line: string) => {
      return line.replace(regex, replacement);
    }, `sed-${pattern}`) as TextPipeline;
  }

  public head(lines: number): TextPipeline {
    // Create a special step that processes the entire input at once
    const step = {
      name: `head-${lines}`,
      type: 'transform' as const,
      execute: async (input: string[]) => {
        return [input.slice(0, lines)];
      }
    };
    
    const newPipeline = new TextPipeline(this.shellInstance, this.options);
    newPipeline.steps = [...this.steps, step as any];
    return newPipeline;
  }

  public tail(lines: number): TextPipeline {
    // Create a special step that processes the entire input at once
    const step = {
      name: `tail-${lines}`,
      type: 'transform' as const,
      execute: async (input: string[]) => {
        return [input.slice(-lines)];
      }
    };
    
    const newPipeline = new TextPipeline(this.shellInstance, this.options);
    newPipeline.steps = [...this.steps, step as any];
    return newPipeline;
  }

  public sort(options?: { numeric?: boolean; reverse?: boolean; ignoreCase?: boolean }): TextPipeline {
    const step = {
      name: 'sort',
      type: 'transform' as const,
      execute: async (input: string[]) => {
        const lines = [...input]; // Don't mutate original
        
        lines.sort((a, b) => {
          let result: number;
          
          if (options?.numeric) {
            result = parseFloat(a) - parseFloat(b);
          } else {
            if (options?.ignoreCase) {
              result = a.toLowerCase().localeCompare(b.toLowerCase());
            } else {
              // Use default string comparison for consistency with JavaScript's default sort
              result = a < b ? -1 : a > b ? 1 : 0;
            }
          }
          
          return options?.reverse ? -result : result;
        });
        
        return [lines];
      }
    };
    
    const newPipeline = new TextPipeline(this.shellInstance, this.options);
    newPipeline.steps = [...this.steps, step as any];
    return newPipeline;
  }

  public unique(): TextPipeline {
    const seen = new Set<string>();
    
    return this.filter((line: string) => {
      if (seen.has(line)) {
        return false;
      }
      seen.add(line);
      return true;
    }, 'unique') as TextPipeline;
  }

  public count(): Pipeline<number> {
    const step = {
      name: 'count',
      type: 'transform' as const,
      execute: async (input: string[]) => {
        return [input.length];
      }
    };
    
    const newPipeline = new TextPipeline(this.shellInstance, this.options);
    newPipeline.steps = [...this.steps, step as any];
    return newPipeline as any;
  }

  public join(separator = '\n'): Pipeline<string> {
    const step = {
      name: 'join',
      type: 'transform' as const,
      execute: async (input: string[]) => {
        return [input.join(separator)];
      }
    };
    
    const newPipeline = new TextPipeline(this.shellInstance, this.options);
    newPipeline.steps = [...this.steps, step as any];
    return newPipeline as any;
  }
}