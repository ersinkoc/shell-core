/**
 * Watch module for @oxog/shell-core
 * Provides file system monitoring and hot-reload capabilities
 */

import { EventEmitter } from 'events';
import { watch, FSWatcher, Stats } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join, resolve, relative, normalize } from 'path';

import type { 
  WatchOptions, 
  WatchEventType, 
  FileWatcher,
  ShellConfig 
} from './types.js';
import { ShellError } from './errors.js';

/**
 * Simple glob pattern matching function
 * Supports basic wildcards: * (any characters) and ** (directory traversal)
 */
function matchGlob(pattern: string, text: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^/\\\\]*')
    .replace(/___DOUBLE_STAR___/g, '.*')
    .replace(/\?/g, '[^/\\\\]');
  
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(text.replace(/\\/g, '/'));
}

/**
 * Advanced file watcher implementation with cross-platform support
 */
export class FileWatcherImpl extends EventEmitter implements FileWatcher {
  private watchers = new Map<string, FSWatcher>();
  private watchedPaths = new Set<string>();
  private options: Required<WatchOptions>;
  private isReady = false;
  private closed = false;
  private stabilityTimers = new Map<string, NodeJS.Timeout>();
  
  constructor(
    paths: string | readonly string[],
    options: WatchOptions = {},
    private config: ShellConfig = {}
  ) {
    super();
    
    this.options = {
      persistent: true,
      recursive: true,
      encoding: 'utf8',
      ignoreInitial: false,
      followSymlinks: false,
      cwd: process.cwd(),
      ignorePermissionErrors: true,
      usePolling: process.platform === 'win32',
      interval: 100,
      binaryInterval: 300,
      depth: Infinity,
      awaitWriteFinish: false,
      ignored: undefined,
      atomic: true,
      ...options
    };
    
    this.setupWatchers(Array.isArray(paths) ? paths : [paths]);
  }
  
  private async setupWatchers(paths: string[]): Promise<void> {
    try {
      for (const path of paths) {
        await this.addPath(path);
      }
      
      this.isReady = true;
      this.emit('ready');
    } catch (error) {
      this.emit('error', new ShellError(
        `Failed to setup file watchers: ${(error as Error).message}`,
        'INVALID_OPERATION',
        'watch.setup',
        undefined,
        undefined,
        undefined,
        { paths, error },
        false
      ));
    }
  }
  
  private async addPath(watchPath: string): Promise<void> {
    const fullPath = resolve(this.options.cwd, watchPath);
    
    if (this.watchedPaths.has(fullPath)) {
      return;
    }
    
    try {
      const stats = await stat(fullPath);
      
      if (stats.isDirectory() && this.options.recursive) {
        await this.watchDirectory(fullPath);
      } else if (stats.isFile()) {
        await this.watchFile(fullPath);
      }
      
      this.watchedPaths.add(fullPath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Watch for creation
        await this.watchForCreation(fullPath);
      } else if (!this.options.ignorePermissionErrors || error.code !== 'EACCES') {
        throw error;
      }
    }
  }
  
  private async watchDirectory(dirPath: string): Promise<void> {
    if (this.shouldIgnore(dirPath)) {
      return;
    }
    
    const watcher = watch(dirPath, {
      persistent: this.options.persistent,
      recursive: false, // We handle recursion manually for better control
      encoding: this.options.encoding as any
    });
    
    watcher.on('change', (eventType, filename) => {
      if (filename) {
        const fullPath = join(dirPath, String(filename));
        this.handleFileEvent(eventType as 'rename' | 'change', fullPath);
      }
    });
    
    watcher.on('error', (error) => {
      this.emit('error', new ShellError(
        `Directory watcher error: ${error.message}`,
        'INVALID_OPERATION',
        'watch.directory',
        dirPath,
        undefined,
        undefined,
        { dirPath, error },
        true
      ));
    });
    
    this.watchers.set(dirPath, watcher);
    
    // Watch subdirectories if recursive
    if (this.options.recursive) {
      try {
        const entries = await readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subDirPath = join(dirPath, entry.name);
            if (!this.shouldIgnore(subDirPath)) {
              await this.watchDirectory(subDirPath);
            }
          }
        }
        
        // Emit add events for existing files if not ignoring initial
        if (!this.options.ignoreInitial && this.isReady) {
          for (const entry of entries) {
            const entryPath = join(dirPath, entry.name);
            if (!this.shouldIgnore(entryPath)) {
              if (entry.isFile()) {
                this.emit('add', entryPath);
              } else if (entry.isDirectory()) {
                this.emit('addDir', entryPath);
              }
            }
          }
        }
      } catch (error: any) {
        if (!this.options.ignorePermissionErrors || error.code !== 'EACCES') {
          throw error;
        }
      }
    }
  }
  
  private async watchFile(filePath: string): Promise<void> {
    if (this.shouldIgnore(filePath)) {
      return;
    }
    
    const watcher = watch(filePath, {
      persistent: this.options.persistent,
      encoding: this.options.encoding as any
    });
    
    watcher.on('change', (eventType) => {
      this.handleFileEvent(eventType as 'rename' | 'change', filePath);
    });
    
    watcher.on('error', (error) => {
      this.emit('error', new ShellError(
        `File watcher error: ${error.message}`,
        'INVALID_OPERATION',
        'watch.file',
        filePath,
        undefined,
        undefined,
        { filePath, error },
        true
      ));
    });
    
    this.watchers.set(filePath, watcher);
    
    // Emit add event for existing file if not ignoring initial
    if (!this.options.ignoreInitial && this.isReady) {
      this.emit('add', filePath);
    }
  }
  
  private async watchForCreation(path: string): Promise<void> {
    const parentDir = resolve(path, '..');
    
    if (!this.watchers.has(parentDir)) {
      try {
        await this.watchDirectory(parentDir);
      } catch (error) {
        // Parent directory doesn't exist, watch its parent
        if ((error as any).code === 'ENOENT') {
          await this.watchForCreation(parentDir);
        }
      }
    }
  }
  
  private async handleFileEvent(eventType: 'rename' | 'change', path: string): Promise<void> {
    if (this.closed || this.shouldIgnore(path)) {
      return;
    }
    
    try {
      const stats = await stat(path);
      
      if (this.options.awaitWriteFinish) {
        this.handleWriteFinish(path, eventType, stats);
        return;
      }
      
      this.emitEvent(eventType, path, stats);
      
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File was deleted
        this.emit('unlink', path);
        
        // Remove watcher if it exists
        const watcher = this.watchers.get(path);
        if (watcher) {
          watcher.close();
          this.watchers.delete(path);
        }
      }
    }
  }
  
  private handleWriteFinish(path: string, eventType: 'rename' | 'change', stats: Stats): void {
    const existingTimer = this.stabilityTimers.get(path);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const awaitOptions = typeof this.options.awaitWriteFinish === 'object' 
      ? this.options.awaitWriteFinish 
      : { stabilityThreshold: 2000, pollInterval: 100 };
    
    const timer = setTimeout(async () => {
      try {
        const currentStats = await stat(path);
        // Check if file has been stable (same size and mtime)
        if (currentStats.size === stats.size && 
            currentStats.mtime.getTime() === stats.mtime.getTime()) {
          this.stabilityTimers.delete(path);
          this.emitEvent(eventType, path, currentStats);
        } else {
          // File still changing, wait more
          this.handleWriteFinish(path, eventType, currentStats);
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          this.emit('unlink', path);
        }
        this.stabilityTimers.delete(path);
      }
    }, awaitOptions.stabilityThreshold || 2000);
    
    this.stabilityTimers.set(path, timer);
  }
  
  private emitEvent(eventType: 'rename' | 'change', path: string, stats: Stats): void {
    if (stats.isFile()) {
      if (eventType === 'rename') {
        this.emit('add', path, stats);
      } else {
        this.emit('change', path, stats);
      }
    } else if (stats.isDirectory()) {
      if (eventType === 'rename') {
        this.emit('addDir', path, stats);
        // Watch the new directory if recursive
        if (this.options.recursive) {
          this.watchDirectory(path).catch(error => {
            this.emit('error', error);
          });
        }
      }
    }
  }
  
  private shouldIgnore(path: string): boolean {
    if (!this.options.ignored) {
      return false;
    }
    
    const relativePath = relative(this.options.cwd, path);
    
    if (typeof this.options.ignored === 'string') {
      return matchGlob(this.options.ignored, relativePath);
    }
    
    if (this.options.ignored instanceof RegExp) {
      return this.options.ignored.test(relativePath);
    }
    
    if (typeof this.options.ignored === 'function') {
      try {
        return this.options.ignored(relativePath);
      } catch {
        return false;
      }
    }
    
    return false;
  }
  
  // FileWatcher interface implementation
  public on(event: WatchEventType, listener: (path: string, stats?: any) => void): FileWatcher;
  public on(event: string | symbol, listener: (...args: any[]) => void): this;
  public on(event: any, listener: any): any {
    super.on(event, listener);
    return this;
  }
  
  public once(event: WatchEventType, listener: (path: string, stats?: any) => void): FileWatcher;
  public once(event: string | symbol, listener: (...args: any[]) => void): this;
  public once(event: any, listener: any): any {
    super.once(event, listener);
    return this;
  }
  
  public removeListener(event: WatchEventType, listener: (path: string, stats?: any) => void): FileWatcher;
  public removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
  public removeListener(event: any, listener: any): any {
    super.removeListener(event, listener);
    return this;
  }
  
  public removeAllListeners(event?: WatchEventType): FileWatcher;
  public removeAllListeners(event?: string | symbol): this;
  public removeAllListeners(event?: any): any {
    super.removeAllListeners(event);
    return this;
  }
  
  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    
    this.closed = true;
    
    // Clear all stability timers
    for (const timer of this.stabilityTimers.values()) {
      clearTimeout(timer);
    }
    this.stabilityTimers.clear();
    
    // Close all watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    this.watchedPaths.clear();
    
    this.removeAllListeners();
  }
  
  public add(paths: string | readonly string[]): FileWatcher {
    if (this.closed) {
      throw new ShellError(
        'Cannot add paths to closed watcher',
        'INVALID_OPERATION',
        'watch.add',
        undefined,
        undefined,
        undefined,
        undefined,
        false
      );
    }
    
    const pathsArray = Array.isArray(paths) ? paths : [paths];
    
    Promise.all(pathsArray.map(path => this.addPath(path)))
      .catch(error => this.emit('error', error));
    
    return this;
  }
  
  public unwatch(paths: string | readonly string[]): FileWatcher {
    const pathsArray = Array.isArray(paths) ? paths : [paths];
    
    for (const path of pathsArray) {
      const fullPath = resolve(this.options.cwd, path);
      const watcher = this.watchers.get(fullPath);
      
      if (watcher) {
        watcher.close();
        this.watchers.delete(fullPath);
        this.watchedPaths.delete(fullPath);
      }
      
      // Clear stability timer if exists
      const timer = this.stabilityTimers.get(fullPath);
      if (timer) {
        clearTimeout(timer);
        this.stabilityTimers.delete(fullPath);
      }
    }
    
    return this;
  }
  
  public getWatched(): Record<string, string[]> {
    const watched: Record<string, string[]> = {};
    
    for (const path of this.watchedPaths) {
      const dir = resolve(path, '..');
      if (!watched[dir]) {
        watched[dir] = [];
      }
      watched[dir].push(relative(dir, path));
    }
    
    return watched;
  }
}

/**
 * Create a file watcher with the specified paths and options
 */
export function createWatcher(
  paths: string | readonly string[],
  options: WatchOptions = {},
  config: ShellConfig = {}
): FileWatcher {
  return new FileWatcherImpl(paths, options, config);
}

/**
 * Hot reload utilities for development workflows
 */
export class HotReloader extends EventEmitter {
  private watcher: FileWatcher | null = null;
  private reloadTimers = new Map<string, NodeJS.Timeout>();
  private debounceTime: number;
  
  constructor(private options: {
    debounceTime?: number;
    extensions?: string[];
    ignored?: string | RegExp | ((path: string) => boolean);
  } = {}) {
    super();
    this.debounceTime = options.debounceTime || 300;
  }
  
  public watch(paths: string | readonly string[], watchOptions: WatchOptions = {}): this {
    if (this.watcher) {
      this.watcher.close();
    }
    
    const combinedOptions: WatchOptions = {
      ignoreInitial: true,
      ignored: this.options.ignored,
      ...watchOptions
    };
    
    this.watcher = createWatcher(paths, combinedOptions);
    
    this.watcher.on('change', (path) => {
      if (this.shouldReload(path)) {
        this.scheduleReload(path, 'change');
      }
    });
    
    this.watcher.on('add', (path) => {
      if (this.shouldReload(path)) {
        this.scheduleReload(path, 'add');
      }
    });
    
    this.watcher.on('unlink', (path) => {
      this.scheduleReload(path, 'unlink');
    });
    
    this.watcher.on('error', (error) => {
      this.emit('error', error);
    });
    
    return this;
  }
  
  private shouldReload(path: string): boolean {
    if (!this.options.extensions) {
      return true;
    }
    
    const ext = path.split('.').pop()?.toLowerCase();
    return ext ? this.options.extensions.includes(ext) : false;
  }
  
  private scheduleReload(path: string, eventType: string): void {
    // Clear existing timer for this path
    const existingTimer = this.reloadTimers.get(path);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Schedule new reload
    const timer = setTimeout(() => {
      this.reloadTimers.delete(path);
      this.emit('reload', { path, eventType, timestamp: new Date() });
    }, this.debounceTime);
    
    this.reloadTimers.set(path, timer);
  }
  
  public async close(): Promise<void> {
    // Clear all timers
    for (const timer of this.reloadTimers.values()) {
      clearTimeout(timer);
    }
    this.reloadTimers.clear();
    
    // Close watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    
    this.removeAllListeners();
  }
}

/**
 * Create a hot reloader for development workflows
 */
export function createHotReloader(options?: {
  debounceTime?: number;
  extensions?: string[];
  ignored?: string | RegExp | ((path: string) => boolean);
}): HotReloader {
  return new HotReloader(options);
}