/**
 * Watch module for @oxog/shell-core
 * Provides file system monitoring and hot-reload capabilities
 */
import { EventEmitter } from 'events';
import { watch } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join, resolve, relative } from 'path';
import { ShellError } from './errors.js';
/**
 * Simple glob pattern matching function
 * Supports basic wildcards: * (any characters) and ** (directory traversal)
 */
function matchGlob(pattern, text) {
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
export class FileWatcherImpl extends EventEmitter {
    config;
    watchers = new Map();
    watchedPaths = new Set();
    options;
    isReady = false;
    closed = false;
    stabilityTimers = new Map();
    constructor(paths, options = {}, config = {}) {
        super();
        this.config = config;
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
    async setupWatchers(paths) {
        try {
            for (const path of paths) {
                await this.addPath(path);
            }
            this.isReady = true;
            this.emit('ready');
        }
        catch (error) {
            this.emit('error', new ShellError(`Failed to setup file watchers: ${error.message}`, 'INVALID_OPERATION', 'watch.setup', undefined, undefined, undefined, { paths, error }, false));
        }
    }
    async addPath(watchPath) {
        const fullPath = resolve(this.options.cwd, watchPath);
        if (this.watchedPaths.has(fullPath)) {
            return;
        }
        try {
            const stats = await stat(fullPath);
            if (stats.isDirectory() && this.options.recursive) {
                await this.watchDirectory(fullPath);
            }
            else if (stats.isFile()) {
                await this.watchFile(fullPath);
            }
            this.watchedPaths.add(fullPath);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                // Watch for creation
                await this.watchForCreation(fullPath);
            }
            else if (!this.options.ignorePermissionErrors || error.code !== 'EACCES') {
                throw error;
            }
        }
    }
    async watchDirectory(dirPath) {
        if (this.shouldIgnore(dirPath)) {
            return;
        }
        const watcher = watch(dirPath, {
            persistent: this.options.persistent,
            recursive: false, // We handle recursion manually for better control
            encoding: this.options.encoding
        });
        watcher.on('change', (eventType, filename) => {
            if (filename) {
                const fullPath = join(dirPath, String(filename));
                this.handleFileEvent(eventType, fullPath);
            }
        });
        watcher.on('error', (error) => {
            this.emit('error', new ShellError(`Directory watcher error: ${error.message}`, 'INVALID_OPERATION', 'watch.directory', dirPath, undefined, undefined, { dirPath, error }, true));
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
                            }
                            else if (entry.isDirectory()) {
                                this.emit('addDir', entryPath);
                            }
                        }
                    }
                }
            }
            catch (error) {
                if (!this.options.ignorePermissionErrors || error.code !== 'EACCES') {
                    throw error;
                }
            }
        }
    }
    async watchFile(filePath) {
        if (this.shouldIgnore(filePath)) {
            return;
        }
        const watcher = watch(filePath, {
            persistent: this.options.persistent,
            encoding: this.options.encoding
        });
        watcher.on('change', (eventType) => {
            this.handleFileEvent(eventType, filePath);
        });
        watcher.on('error', (error) => {
            this.emit('error', new ShellError(`File watcher error: ${error.message}`, 'INVALID_OPERATION', 'watch.file', filePath, undefined, undefined, { filePath, error }, true));
        });
        this.watchers.set(filePath, watcher);
        // Emit add event for existing file if not ignoring initial
        if (!this.options.ignoreInitial && this.isReady) {
            this.emit('add', filePath);
        }
    }
    async watchForCreation(path) {
        const parentDir = resolve(path, '..');
        if (!this.watchers.has(parentDir)) {
            try {
                await this.watchDirectory(parentDir);
            }
            catch (error) {
                // Parent directory doesn't exist, watch its parent
                if (error.code === 'ENOENT') {
                    await this.watchForCreation(parentDir);
                }
            }
        }
    }
    async handleFileEvent(eventType, path) {
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
        }
        catch (error) {
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
    handleWriteFinish(path, eventType, stats) {
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
                }
                else {
                    // File still changing, wait more
                    this.handleWriteFinish(path, eventType, currentStats);
                }
            }
            catch (error) {
                if (error.code === 'ENOENT') {
                    this.emit('unlink', path);
                }
                this.stabilityTimers.delete(path);
            }
        }, awaitOptions.stabilityThreshold || 2000);
        this.stabilityTimers.set(path, timer);
    }
    emitEvent(eventType, path, stats) {
        if (stats.isFile()) {
            if (eventType === 'rename') {
                this.emit('add', path, stats);
            }
            else {
                this.emit('change', path, stats);
            }
        }
        else if (stats.isDirectory()) {
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
    shouldIgnore(path) {
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
            }
            catch {
                return false;
            }
        }
        return false;
    }
    on(event, listener) {
        super.on(event, listener);
        return this;
    }
    once(event, listener) {
        super.once(event, listener);
        return this;
    }
    removeListener(event, listener) {
        super.removeListener(event, listener);
        return this;
    }
    removeAllListeners(event) {
        super.removeAllListeners(event);
        return this;
    }
    async close() {
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
    add(paths) {
        if (this.closed) {
            throw new ShellError('Cannot add paths to closed watcher', 'INVALID_OPERATION', 'watch.add', undefined, undefined, undefined, undefined, false);
        }
        const pathsArray = Array.isArray(paths) ? paths : [paths];
        Promise.all(pathsArray.map(path => this.addPath(path)))
            .catch(error => this.emit('error', error));
        return this;
    }
    unwatch(paths) {
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
    getWatched() {
        const watched = {};
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
export function createWatcher(paths, options = {}, config = {}) {
    return new FileWatcherImpl(paths, options, config);
}
/**
 * Hot reload utilities for development workflows
 */
export class HotReloader extends EventEmitter {
    options;
    watcher = null;
    reloadTimers = new Map();
    debounceTime;
    constructor(options = {}) {
        super();
        this.options = options;
        this.debounceTime = options.debounceTime || 300;
    }
    watch(paths, watchOptions = {}) {
        if (this.watcher) {
            this.watcher.close();
        }
        const combinedOptions = {
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
    shouldReload(path) {
        if (!this.options.extensions) {
            return true;
        }
        const ext = path.split('.').pop()?.toLowerCase();
        return ext ? this.options.extensions.includes(ext) : false;
    }
    scheduleReload(path, eventType) {
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
    async close() {
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
export function createHotReloader(options) {
    return new HotReloader(options);
}
//# sourceMappingURL=watch.js.map