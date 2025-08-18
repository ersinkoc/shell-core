import { EventEmitter } from 'events';
import type { 
  ShellConfig, 
  ShellCore, 
  IShellPlugin,
  CopyOptions,
  MoveOptions,
  RemoveOptions,
  MkdirOptions,
  TouchOptions,
  ExecOptions,
  SpawnOptions,
  CommandResult,
  GrepOptions,
  WatchOptions,
  FileWatcher,
  TransactionOptions
} from './types.js';
import { FileSystemOperations } from './fs.js';
import { ProcessOperations } from './process.js';
import { TextOperations } from './text.js';
import { PluginManager } from './plugins.js';
import { Pipeline, FilePipeline, TextPipeline, type PipelineOptions } from './pipeline.js';
import { createWatcher } from './watch.js';
import { Transaction, createTransactionManager, type TransactionManager } from './transaction.js';
// import { ShellError } from './errors.js';
import { globalPathCache } from './utils.js';

export class Shell extends EventEmitter implements ShellCore {
  private config: ShellConfig = {
    silent: false,
    fatal: false,
    verbose: false,
    color: true,
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30000,
    retries: 3,
    cwd: process.cwd(),
    env: process.env as any,
    shell: true,
    encoding: 'utf8',
    trash: false,
    cache: true,
    parallel: 4
  };

  private readonly fs: FileSystemOperations;
  private readonly process: ProcessOperations;
  private readonly text: TextOperations;
  private readonly plugins: PluginManager;
  private readonly transactionManager: TransactionManager;

  constructor(config?: Partial<ShellConfig>) {
    super();
    
    if (config) {
      this.configure(config);
    }

    this.fs = new FileSystemOperations();
    this.process = new ProcessOperations();
    this.text = new TextOperations();
    this.plugins = new PluginManager(this);
    this.transactionManager = createTransactionManager(this);

    // Set up error handling
    this.on('error', (error) => {
      if (this.config.fatal) {
        throw error;
      }
      if (!this.config.silent) {
        console.error('Shell Error:', error);
      }
    });
  }

  public configure(config: Partial<ShellConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.cwd) {
      process.chdir(config.cwd);
    }
    
    if (config.env) {
      Object.assign(process.env, config.env);
    }

    this.emit('configChanged', this.config);
  }

  public getConfig(): Readonly<ShellConfig> {
    return { ...this.config };
  }

  // Plugin management
  public use(plugin: IShellPlugin): void {
    this.plugins.use(plugin);
    
    // Attach plugin commands to shell with namespace support
    if (plugin.commands) {
      for (const [fullName, handler] of Object.entries(plugin.commands)) {
        const parts = fullName.split('.');
        if (parts.length === 2) {
          const [namespace, method] = parts;
          // Create namespace if it doesn't exist
          if (!this[namespace]) {
            this[namespace] = {};
          }
          // Attach the command method
          this[namespace][method] = handler.bind(plugin);
        }
      }
    }
    
    this.emit('pluginInstalled', plugin.name);
  }

  public unuse(pluginName: string): void {
    // Get plugin before uninstalling to clean up commands
    const plugin = this.plugins.getPlugin(pluginName);
    if (plugin && plugin.commands) {
      // Remove plugin commands from shell namespaces
      for (const [fullName] of Object.entries(plugin.commands)) {
        const parts = fullName.split('.');
        if (parts.length === 2) {
          const [namespace, method] = parts;
          if (this[namespace] && this[namespace][method]) {
            delete this[namespace][method];
            // Remove namespace if empty
            if (Object.keys(this[namespace]).length === 0) {
              delete this[namespace];
            }
          }
        }
      }
    }
    
    this.plugins.unuse(pluginName);
    this.emit('pluginUninstalled', pluginName);
  }

  public applyFilter(filterName: string, input: any): any {
    return this.plugins.applyFilter(filterName, input);
  }

  public getTransformer(transformerName: string, ...args: any[]): (input: any) => any {
    return this.plugins.getTransformer(transformerName, ...args);
  }

  public getPluginInfo(pluginName: string): any {
    return this.plugins.getPluginInfo(pluginName);
  }

  // File system operations
  public async copy(source: string, dest: string, options?: CopyOptions): Promise<void> {
    const mergedOptions = {
      ...options,
      retry: options?.retry ?? (this.config.retries ? { 
        attempts: this.config.retries, 
        delay: 1000, 
        backoff: 2 
      } : undefined)
    };

    try {
      await this.fs.copy(source, dest, mergedOptions);
      this.emit('operationComplete', { operation: 'copy', source, dest });
    } catch (error) {
      this.emit('error', error);
      if (this.config.fatal) throw error;
      // Always throw for internal usage (like transactions)
      if ((options as any)?.__internal) throw error;
    }
  }

  public async move(source: string, dest: string, options?: MoveOptions): Promise<void> {
    const mergedOptions = {
      ...options,
      retry: options?.retry ?? (this.config.retries ? { 
        attempts: this.config.retries, 
        delay: 1000, 
        backoff: 2 
      } : undefined)
    };

    try {
      await this.fs.move(source, dest, mergedOptions);
      this.emit('operationComplete', { operation: 'move', source, dest });
    } catch (error) {
      this.emit('error', error);
      if (this.config.fatal) throw error;
      if ((options as any)?.__internal) throw error;
    }
  }

  public async remove(path: string, options?: RemoveOptions): Promise<void> {
    const mergedOptions = {
      trash: this.config.trash,
      ...options,
      retry: options?.retry ?? (this.config.retries ? { 
        attempts: this.config.retries, 
        delay: 1000, 
        backoff: 2 
      } : undefined)
    };

    try {
      await this.fs.remove(path, mergedOptions);
      this.emit('operationComplete', { operation: 'remove', path });
    } catch (error) {
      this.emit('error', error);
      if (this.config.fatal) throw error;
      if ((options as any)?.__internal) throw error;
    }
  }

  public async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    const mergedOptions = {
      recursive: true,
      ...options,
      retry: options?.retry ?? (this.config.retries ? { 
        attempts: this.config.retries, 
        delay: 1000, 
        backoff: 2 
      } : undefined)
    };

    try {
      await this.fs.mkdir(path, mergedOptions);
      this.emit('operationComplete', { operation: 'mkdir', path });
    } catch (error) {
      this.emit('error', error);
      if (this.config.fatal) throw error;
      if ((options as any)?.__internal) throw error;
    }
  }

  public async touch(path: string, options?: TouchOptions): Promise<void> {
    const mergedOptions = {
      ...options,
      retry: options?.retry ?? (this.config.retries ? { 
        attempts: this.config.retries, 
        delay: 1000, 
        backoff: 2 
      } : undefined)
    };

    try {
      await this.fs.touch(path, mergedOptions);
      this.emit('operationComplete', { operation: 'touch', path });
    } catch (error) {
      this.emit('error', error);
      if (this.config.fatal) throw error;
    }
  }

  // Process operations
  public async exec(command: string, options?: ExecOptions): Promise<CommandResult> {
    const mergedOptions = {
      cwd: this.config.cwd,
      env: this.config.env,
      timeout: this.config.timeout,
      maxBuffer: this.config.maxBuffer,
      encoding: this.config.encoding,
      shell: this.config.shell,
      silent: this.config.silent,
      ...options,
      retry: options?.retry ?? (this.config.retries ? { 
        attempts: this.config.retries, 
        delay: 1000, 
        backoff: 2 
      } : undefined)
    };

    try {
      const result = await this.process.exec(command, mergedOptions);
      this.emit('operationComplete', { operation: 'exec', command, result });
      return result;
    } catch (error) {
      this.emit('error', error);
      if (this.config.fatal) throw error;
      throw error;
    }
  }

  public async spawn(command: string, args?: readonly string[], options?: SpawnOptions): Promise<CommandResult> {
    const mergedOptions = {
      cwd: this.config.cwd,
      env: this.config.env,
      timeout: this.config.timeout,
      maxBuffer: this.config.maxBuffer,
      encoding: this.config.encoding,
      shell: false, // spawn defaults to false unless explicitly set
      silent: this.config.silent,
      ...options,
      retry: options?.retry ?? (this.config.retries ? { 
        attempts: this.config.retries, 
        delay: 1000, 
        backoff: 2 
      } : undefined)
    };

    try {
      const result = await this.process.spawn(command, args, mergedOptions);
      this.emit('operationComplete', { operation: 'spawn', command, args, result });
      return result;
    } catch (error) {
      this.emit('error', error);
      if (this.config.fatal) throw error;
      throw error;
    }
  }

  public async which(command: string): Promise<string | null> {
    try {
      const result = await this.process.which(command);
      this.emit('operationComplete', { operation: 'which', command, result });
      return result;
    } catch (error) {
      this.emit('error', error);
      if (this.config.fatal) throw error;
      return null;
    }
  }

  public async parallel(
    commands: readonly string[] | readonly { command: string; args?: readonly string[]; options?: SpawnOptions }[],
    options?: { concurrency?: number; failFast?: boolean }
  ): Promise<CommandResult[]> {
    const mergedOptions = {
      concurrency: this.config.parallel,
      ...options
    };

    try {
      const results = await this.process.parallel(commands, mergedOptions);
      this.emit('operationComplete', { operation: 'parallel', commands, results });
      return results;
    } catch (error) {
      this.emit('error', error);
      if (this.config.fatal) throw error;
      throw error;
    }
  }

  // Text processing operations
  public async grep(pattern: string | RegExp, files: string | readonly string[], options?: GrepOptions): Promise<string[]> {
    try {
      const results = await this.text.grep(pattern, files, options);
      this.emit('operationComplete', { operation: 'grep', pattern, files, results });
      return results;
    } catch (error) {
      this.emit('error', error);
      if (this.config.fatal) throw error;
      throw error;
    }
  }

  public async sed(pattern: string | RegExp, replacement: string, files: string | readonly string[], options?: any): Promise<string> {
    try {
      const results = await this.text.sed(pattern, replacement, files, options);
      this.emit('operationComplete', { operation: 'sed', pattern, replacement, files, results });
      return results.join('\n');
    } catch (error) {
      this.emit('error', error);
      if (this.config.fatal) throw error;
      throw error;
    }
  }

  public async head(file: string, options?: any): Promise<string> {
    try {
      const results = await this.text.head(file, options);
      this.emit('operationComplete', { operation: 'head', file, results });
      return results.join('\n');
    } catch (error) {
      this.emit('error', error);
      if (this.config.fatal) throw error;
      throw error;
    }
  }

  public async tail(file: string, options?: any): Promise<string> {
    try {
      const results = await this.text.tail(file, options);
      this.emit('operationComplete', { operation: 'tail', file, results });
      return results.join('\n');
    } catch (error) {
      this.emit('error', error);
      if (this.config.fatal) throw error;
      throw error;
    }
  }

  public async sort(input: string[] | string, options?: any): Promise<string> {
    try {
      const results = await this.text.sort(input, options);
      this.emit('operationComplete', { operation: 'sort', input, results });
      return results.join('\n');
    } catch (error) {
      this.emit('error', error);
      if (this.config.fatal) throw error;
      throw error;
    }
  }

  public async uniq(input: string[] | string, options?: any): Promise<string> {
    try {
      const results = await this.text.uniq(input, options);
      this.emit('operationComplete', { operation: 'uniq', input, results });
      return results.join('\n');
    } catch (error) {
      this.emit('error', error);
      if (this.config.fatal) throw error;
      throw error;
    }
  }

  public async wc(files: string | readonly string[]): Promise<{ lines: number; words: number; chars: number; bytes: number; file: string }[]> {
    try {
      const results = await this.text.wc(files);
      this.emit('operationComplete', { operation: 'wc', files, results });
      return results;
    } catch (error) {
      this.emit('error', error);
      if (this.config.fatal) throw error;
      throw error;
    }
  }

  // Pipeline operations
  public pipeline(options?: PipelineOptions): Pipeline<string> {
    return new Pipeline(this, {
      parallel: this.config.parallel,
      verbose: this.config.verbose,
      ...options
    });
  }

  public filePipeline(options?: PipelineOptions): FilePipeline {
    return new FilePipeline(this, {
      parallel: this.config.parallel,
      verbose: this.config.verbose,
      ...options
    });
  }

  public textPipeline(options?: PipelineOptions): TextPipeline {
    return new TextPipeline(this, {
      parallel: this.config.parallel,
      verbose: this.config.verbose,
      ...options
    });
  }

  // Fluent API support
  public find(pattern: string): FilePipeline {
    return this.filePipeline().find(pattern);
  }

  // Utility methods
  public clearCache(): void {
    globalPathCache.clear();
    this.emit('cacheCleared');
  }

  public getStats(): {
    cacheSize: number;
    plugins: readonly string[];
    config: Readonly<ShellConfig>;
  } {
    return {
      cacheSize: globalPathCache.size(),
      plugins: this.plugins.listPlugins().map(p => p.name),
      config: this.getConfig()
    };
  }

  // Event-based operations
  public override on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  // File watching capabilities
  public watch(paths: string | readonly string[], options?: WatchOptions): FileWatcher {
    const watchOptions: WatchOptions = {
      cwd: this.config.cwd,
      ...options
    };
    
    const watcher = createWatcher(paths, watchOptions, this.config);
    
    // Forward watcher events to shell events
    watcher.on('change', (path, stats) => {
      this.emit('fileChanged', { path, stats, timestamp: new Date() });
    });
    
    watcher.on('add', (path, stats) => {
      this.emit('fileAdded', { path, stats, timestamp: new Date() });
    });
    
    watcher.on('unlink', (path) => {
      this.emit('fileRemoved', { path, timestamp: new Date() });
    });
    
    watcher.on('addDir', (path, stats) => {
      this.emit('directoryAdded', { path, stats, timestamp: new Date() });
    });
    
    watcher.on('unlinkDir', (path) => {
      this.emit('directoryRemoved', { path, timestamp: new Date() });
    });
    
    watcher.on('error', (error) => {
      this.emit('watchError', error);
      if (this.config.fatal) throw error;
    });
    
    watcher.on('ready', () => {
      this.emit('watchReady', { paths, options: watchOptions });
    });
    
    return watcher;
  }

  // Transaction support with rollback capabilities
  public async transaction<T>(fn: (tx: Transaction) => Promise<T>, options?: TransactionOptions): Promise<T> {
    const tx = this.transactionManager.begin(options);
    
    try {
      const result = await fn(tx);
      
      if (!options?.autoCommit) {
        await tx.commit();
      }
      
      return result;
      
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
}

// Factory function for creating shell instances
export function createShell(config?: Partial<ShellConfig>): Shell {
  return new Shell(config);
}

// Default instance
export const shell = createShell();