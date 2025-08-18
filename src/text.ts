import { readFile, writeFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import type { GrepOptions } from './types.js';
import { ShellError } from './errors.js';
import { resolvePath, validatePath, pathExists, getFileInfo } from './utils.js';

export interface SedOptions {
  readonly inPlace?: boolean;
  readonly backup?: string;
  readonly global?: boolean;
}

export interface SortOptions {
  readonly numeric?: boolean;
  readonly reverse?: boolean;
  readonly unique?: boolean;
  readonly ignoreCase?: boolean;
  readonly randomize?: boolean;
  readonly compareFn?: (a: string, b: string) => number;
}

export interface HeadTailOptions {
  readonly lines?: number;
  readonly bytes?: number;
  readonly quiet?: boolean;
  readonly verbose?: boolean;
}

export interface UniqOptions {
  readonly count?: boolean;
  readonly repeated?: boolean;
  readonly unique?: boolean;
  readonly ignoreCase?: boolean;
  readonly skipFields?: number;
  readonly skipChars?: number;
}

export class TextOperations {
  public async grep(
    pattern: string | RegExp,
    files: string | readonly string[],
    options: GrepOptions = {}
  ): Promise<string[]> {
    const fileList = Array.isArray(files) ? files : [files];
    const results: string[] = [];
    
    const regex = typeof pattern === 'string' 
      ? new RegExp(
          pattern, 
          `${options.ignoreCase ? 'i' : ''}${options.multiline ? 'ms' : 'm'}`
        )
      : pattern;

    for (const file of fileList) {
      const resolvedFile = resolvePath(file);
      validatePath(resolvedFile, 'grep');
      
      if (!await pathExists(resolvedFile)) {
        if (!options.count) {
          throw new ShellError(
            `File not found: ${resolvedFile}`,
            'ENOENT',
            'grep',
            resolvedFile
          );
        }
        continue;
      }

      const fileResults = await this.grepFile(resolvedFile, regex, options);
      results.push(...fileResults);
      
      if (options.maxMatches && results.length >= options.maxMatches) {
        break;
      }
    }

    return results;
  }

  private async grepFile(file: string, regex: RegExp, options: GrepOptions): Promise<string[]> {
    const results: string[] = [];
    
    try {
      if (options.multiline) {
        // For multiline patterns, read entire file
        const content = await readFile(file, 'utf-8');
        const matches = content.match(new RegExp(regex.source, regex.flags + 'g')) || [];
        
        if (options.count) {
          results.push(`${file}:${matches.length}`);
        } else {
          matches.forEach(match => {
            const formatted = options.lineNumber ? `${file}:${match}` : match;
            results.push(options.invert ? '' : formatted);
          });
        }
      } else {
        // Line-by-line processing for memory efficiency
        const fileStream = createReadStream(file);
        const rl = createInterface({
          input: fileStream,
          crlfDelay: Infinity
        });

        let lineNumber = 0;
        let matchCount = 0;
        
        for await (const line of rl) {
          lineNumber++;
          const isMatch = regex.test(line);
          
          if (options.invert ? !isMatch : isMatch) {
            matchCount++;
            
            if (!options.count) {
              let result = line;
              
              if (options.lineNumber) {
                result = `${file}:${lineNumber}:${line}`;
              }
              
              // Add context lines if requested
              if (options.context || options.beforeContext || options.afterContext) {
                // This would require more complex buffering - simplified for now
                result = `${file}:${lineNumber}:${line}`;
              }
              
              results.push(result);
            }
            
            if (options.maxMatches && matchCount >= options.maxMatches) {
              break;
            }
          }
        }
        
        if (options.count) {
          results.push(`${file}:${matchCount}`);
        }
      }
    } catch (error) {
      throw ShellError.fromNodeError(error as NodeJS.ErrnoException, 'grep', file);
    }

    return results;
  }

  public async sed(
    pattern: string | RegExp,
    replacement: string,
    files: string | readonly string[],
    options: SedOptions = {}
  ): Promise<string[]> {
    const fileList = Array.isArray(files) ? files : [files];
    const results: string[] = [];
    
    const regex = typeof pattern === 'string' 
      ? new RegExp(pattern, options.global ? 'g' : '')
      : pattern;

    for (const file of fileList) {
      const resolvedFile = resolvePath(file);
      validatePath(resolvedFile, 'sed');
      
      if (!await pathExists(resolvedFile)) {
        throw new ShellError(
          `File not found: ${resolvedFile}`,
          'ENOENT',
          'sed',
          resolvedFile
        );
      }

      try {
        const content = await readFile(resolvedFile, 'utf-8');
        const modifiedContent = content.replace(regex, replacement);
        
        if (options.inPlace) {
          // Create backup if requested
          if (options.backup) {
            const backupFile = `${resolvedFile}${options.backup}`;
            await writeFile(backupFile, content);
          }
          
          await writeFile(resolvedFile, modifiedContent);
          results.push(`Modified: ${resolvedFile}`);
        } else {
          results.push(modifiedContent);
        }
      } catch (error) {
        throw ShellError.fromNodeError(error as NodeJS.ErrnoException, 'sed', resolvedFile);
      }
    }

    return results;
  }

  public async head(file: string, options: HeadTailOptions = {}): Promise<string[]> {
    const resolvedFile = resolvePath(file);
    validatePath(resolvedFile, 'head');
    
    if (!await pathExists(resolvedFile)) {
      throw new ShellError(
        `File not found: ${resolvedFile}`,
        'ENOENT',
        'head',
        resolvedFile
      );
    }

    const lines = options.lines ?? 10;
    const results: string[] = [];

    try {
      if (options.bytes) {
        const content = await readFile(resolvedFile);
        const chunk = content.subarray(0, options.bytes);
        return [chunk.toString('utf-8')];
      }

      const fileStream = createReadStream(resolvedFile);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      let count = 0;
      for await (const line of rl) {
        if (count >= lines) break;
        results.push(line);
        count++;
      }
    } catch (error) {
      throw ShellError.fromNodeError(error as NodeJS.ErrnoException, 'head', resolvedFile);
    }

    return results;
  }

  public async tail(file: string, options: HeadTailOptions = {}): Promise<string[]> {
    const resolvedFile = resolvePath(file);
    validatePath(resolvedFile, 'tail');
    
    if (!await pathExists(resolvedFile)) {
      throw new ShellError(
        `File not found: ${resolvedFile}`,
        'ENOENT',
        'tail',
        resolvedFile
      );
    }

    const lines = options.lines ?? 10;

    try {
      if (options.bytes) {
        const fileInfo = await getFileInfo(resolvedFile);
        const start = Math.max(0, fileInfo.size - options.bytes);
        const content = await readFile(resolvedFile);
        const chunk = content.subarray(start);
        return [chunk.toString('utf-8')];
      }

      const content = await readFile(resolvedFile, 'utf-8');
      const allLines = content.split('\n');
      const startIndex = Math.max(0, allLines.length - lines);
      
      return allLines.slice(startIndex);
    } catch (error) {
      throw ShellError.fromNodeError(error as NodeJS.ErrnoException, 'tail', resolvedFile);
    }
  }

  public async sort(
    input: string[] | string,
    options: SortOptions = {}
  ): Promise<string[]> {
    let lines: string[];
    
    if (typeof input === 'string') {
      const resolvedFile = resolvePath(input);
      validatePath(resolvedFile, 'sort');
      
      if (!await pathExists(resolvedFile)) {
        throw new ShellError(
          `File not found: ${resolvedFile}`,
          'ENOENT',
          'sort',
          resolvedFile
        );
      }
      
      try {
        const content = await readFile(resolvedFile, 'utf-8');
        lines = content.split('\n').filter(line => line.length > 0);
      } catch (error) {
        throw ShellError.fromNodeError(error as NodeJS.ErrnoException, 'sort', resolvedFile);
      }
    } else {
      lines = [...input];
    }

    if (options.randomize) {
      // Fisher-Yates shuffle
      for (let i = lines.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lines[i], lines[j]] = [lines[j]!, lines[i]!];
      }
      return lines;
    }

    let compareFn = options.compareFn;
    
    if (!compareFn) {
      if (options.numeric) {
        compareFn = (a: string, b: string): number => {
          const numA = parseFloat(a);
          const numB = parseFloat(b);
          return numA - numB;
        };
      } else {
        compareFn = (a: string, b: string): number => {
          const strA = options.ignoreCase ? a.toLowerCase() : a;
          const strB = options.ignoreCase ? b.toLowerCase() : b;
          // Use simple string comparison for ASCII ordering
          if (strA < strB) return -1;
          if (strA > strB) return 1;
          return 0;
        };
      }
    }

    lines.sort(compareFn);
    
    if (options.reverse) {
      lines.reverse();
    }
    
    if (options.unique) {
      lines = [...new Set(lines)];
    }

    return lines;
  }

  public async uniq(
    input: string[] | string,
    options: UniqOptions = {}
  ): Promise<string[]> {
    let lines: string[];
    
    if (typeof input === 'string') {
      const resolvedFile = resolvePath(input);
      validatePath(resolvedFile, 'uniq');
      
      if (!await pathExists(resolvedFile)) {
        throw new ShellError(
          `File not found: ${resolvedFile}`,
          'ENOENT',
          'uniq',
          resolvedFile
        );
      }
      
      try {
        const content = await readFile(resolvedFile, 'utf-8');
        lines = content.split('\n');
      } catch (error) {
        throw ShellError.fromNodeError(error as NodeJS.ErrnoException, 'uniq', resolvedFile);
      }
    } else {
      lines = [...input];
    }

    const processLine = (line: string): string => {
      let processed = line;
      
      if (options.skipFields) {
        const fields = processed.split(/\s+/);
        processed = fields.slice(options.skipFields).join(' ');
      }
      
      if (options.skipChars) {
        processed = processed.substring(options.skipChars);
      }
      
      if (options.ignoreCase) {
        processed = processed.toLowerCase();
      }
      
      return processed;
    };

    const results: string[] = [];
    const counts = new Map<string, { original: string; count: number }>();
    
    for (const line of lines) {
      const key = processLine(line);
      const existing = counts.get(key);
      
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, { original: line, count: 1 });
      }
    }

    for (const [_, { original, count }] of counts) {
      const include = 
        (!options.repeated && !options.unique) ||
        (options.repeated && count > 1) ||
        (options.unique && count === 1);
      
      if (include) {
        if (options.count) {
          results.push(`${count} ${original}`);
        } else {
          results.push(original);
        }
      }
    }

    return results;
  }

  public async wc(files: string | readonly string[]): Promise<{ lines: number; words: number; chars: number; bytes: number; file: string }[]> {
    const fileList = Array.isArray(files) ? files : [files];
    const results: { lines: number; words: number; chars: number; bytes: number; file: string }[] = [];

    for (const file of fileList) {
      const resolvedFile = resolvePath(file);
      validatePath(resolvedFile, 'wc');
      
      if (!await pathExists(resolvedFile)) {
        throw new ShellError(
          `File not found: ${resolvedFile}`,
          'ENOENT',
          'wc',
          resolvedFile
        );
      }

      try {
        const content = await readFile(resolvedFile, 'utf-8');
        const bytes = Buffer.byteLength(content, 'utf-8');
        const lines = content.length === 0 ? 0 : content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
        const words = content.split(/\s+/).filter(word => word.length > 0).length;
        const chars = content.length;

        results.push({
          lines,
          words,
          chars,
          bytes,
          file: resolvedFile
        });
      } catch (error) {
        throw ShellError.fromNodeError(error as NodeJS.ErrnoException, 'wc', resolvedFile);
      }
    }

    return results;
  }

  public cut(
    input: string,
    options: {
      readonly fields?: string;
      readonly characters?: string;
      readonly delimiter?: string;
      readonly outputDelimiter?: string;
    } = {}
  ): string[] {
    const lines = input.split('\n');
    const delimiter = options.delimiter ?? '\t';
    const outputDelimiter = options.outputDelimiter ?? delimiter;
    const results: string[] = [];

    for (const line of lines) {
      if (options.fields) {
        const fields = line.split(delimiter);
        const selectedFields: string[] = [];
        
        // Parse field selection (e.g., "1,3-5,7")
        const ranges = options.fields.split(',');
        for (const range of ranges) {
          if (range.includes('-')) {
            const [start, end] = range.split('-').map(n => parseInt(n, 10) - 1);
            for (let i = start; i <= end && i < fields.length; i++) {
              if (i >= 0) selectedFields.push(fields[i]!);
            }
          } else {
            const index = parseInt(range, 10) - 1;
            if (index >= 0 && index < fields.length) {
              selectedFields.push(fields[index]!);
            }
          }
        }
        
        results.push(selectedFields.join(outputDelimiter));
      } else if (options.characters) {
        // Parse character selection (e.g., "1,3-5,7")
        const selectedChars: string[] = [];
        const ranges = options.characters.split(',');
        
        for (const range of ranges) {
          if (range.includes('-')) {
            const [start, end] = range.split('-').map(n => parseInt(n, 10) - 1);
            for (let i = start; i <= end && i < line.length; i++) {
              if (i >= 0) selectedChars.push(line[i]!);
            }
          } else {
            const index = parseInt(range, 10) - 1;
            if (index >= 0 && index < line.length) {
              selectedChars.push(line[index]!);
            }
          }
        }
        
        results.push(selectedChars.join(''));
      } else {
        results.push(line);
      }
    }

    return results;
  }
}