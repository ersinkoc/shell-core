"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shell = exports.Shell = void 0;
exports.createShell = createShell;
const events_1 = require("events");
const fs_js_1 = require("./fs.js");
const process_js_1 = require("./process.js");
const text_js_1 = require("./text.js");
const plugins_js_1 = require("./plugins.js");
const pipeline_js_1 = require("./pipeline.js");
const watch_js_1 = require("./watch.js");
const transaction_js_1 = require("./transaction.js");
// import { ShellError } from './errors.cjs';
const utils_js_1 = require("./utils.js");
class Shell extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.config = {
            silent: false,
            fatal: false,
            verbose: false,
            color: true,
            maxBuffer: 10 * 1024 * 1024,
            timeout: 30000,
            retries: 3,
            cwd: process.cwd(),
            env: process.env,
            shell: true,
            encoding: 'utf8',
            trash: false,
            cache: true,
            parallel: 4
        };
        if (config) {
            this.configure(config);
        }
        this.fs = new fs_js_1.FileSystemOperations();
        this.process = new process_js_1.ProcessOperations();
        this.text = new text_js_1.TextOperations();
        this.plugins = new plugins_js_1.PluginManager(this);
        this.transactionManager = (0, transaction_js_1.createTransactionManager)(this);
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
    configure(config) {
        this.config = { ...this.config, ...config };
        if (config.cwd) {
            process.chdir(config.cwd);
        }
        if (config.env) {
            Object.assign(process.env, config.env);
        }
        this.emit('configChanged', this.config);
    }
    getConfig() {
        return { ...this.config };
    }
    // Plugin management
    use(plugin) {
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
    unuse(pluginName) {
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
    applyFilter(filterName, input) {
        return this.plugins.applyFilter(filterName, input);
    }
    getTransformer(transformerName, ...args) {
        return this.plugins.getTransformer(transformerName, ...args);
    }
    getPluginInfo(pluginName) {
        return this.plugins.getPluginInfo(pluginName);
    }
    // File system operations
    async copy(source, dest, options) {
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
        }
        catch (error) {
            this.emit('error', error);
            if (this.config.fatal)
                throw error;
            // Always throw for internal usage (like transactions)
            if (options?.__internal)
                throw error;
        }
    }
    async move(source, dest, options) {
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
        }
        catch (error) {
            this.emit('error', error);
            if (this.config.fatal)
                throw error;
            if (options?.__internal)
                throw error;
        }
    }
    async remove(path, options) {
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
        }
        catch (error) {
            this.emit('error', error);
            if (this.config.fatal)
                throw error;
            if (options?.__internal)
                throw error;
        }
    }
    async mkdir(path, options) {
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
        }
        catch (error) {
            this.emit('error', error);
            if (this.config.fatal)
                throw error;
            if (options?.__internal)
                throw error;
        }
    }
    async touch(path, options) {
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
        }
        catch (error) {
            this.emit('error', error);
            if (this.config.fatal)
                throw error;
        }
    }
    // Process operations
    async exec(command, options) {
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
        }
        catch (error) {
            this.emit('error', error);
            if (this.config.fatal)
                throw error;
            throw error;
        }
    }
    async spawn(command, args, options) {
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
        }
        catch (error) {
            this.emit('error', error);
            if (this.config.fatal)
                throw error;
            throw error;
        }
    }
    async which(command) {
        try {
            const result = await this.process.which(command);
            this.emit('operationComplete', { operation: 'which', command, result });
            return result;
        }
        catch (error) {
            this.emit('error', error);
            if (this.config.fatal)
                throw error;
            return null;
        }
    }
    async parallel(commands, options) {
        const mergedOptions = {
            concurrency: this.config.parallel,
            ...options
        };
        try {
            const results = await this.process.parallel(commands, mergedOptions);
            this.emit('operationComplete', { operation: 'parallel', commands, results });
            return results;
        }
        catch (error) {
            this.emit('error', error);
            if (this.config.fatal)
                throw error;
            throw error;
        }
    }
    // Text processing operations
    async grep(pattern, files, options) {
        try {
            const results = await this.text.grep(pattern, files, options);
            this.emit('operationComplete', { operation: 'grep', pattern, files, results });
            return results;
        }
        catch (error) {
            this.emit('error', error);
            if (this.config.fatal)
                throw error;
            throw error;
        }
    }
    async sed(pattern, replacement, files, options) {
        try {
            const results = await this.text.sed(pattern, replacement, files, options);
            this.emit('operationComplete', { operation: 'sed', pattern, replacement, files, results });
            return results.join('\n');
        }
        catch (error) {
            this.emit('error', error);
            if (this.config.fatal)
                throw error;
            throw error;
        }
    }
    async head(file, options) {
        try {
            const results = await this.text.head(file, options);
            this.emit('operationComplete', { operation: 'head', file, results });
            return results.join('\n');
        }
        catch (error) {
            this.emit('error', error);
            if (this.config.fatal)
                throw error;
            throw error;
        }
    }
    async tail(file, options) {
        try {
            const results = await this.text.tail(file, options);
            this.emit('operationComplete', { operation: 'tail', file, results });
            return results.join('\n');
        }
        catch (error) {
            this.emit('error', error);
            if (this.config.fatal)
                throw error;
            throw error;
        }
    }
    async sort(input, options) {
        try {
            const results = await this.text.sort(input, options);
            this.emit('operationComplete', { operation: 'sort', input, results });
            return results.join('\n');
        }
        catch (error) {
            this.emit('error', error);
            if (this.config.fatal)
                throw error;
            throw error;
        }
    }
    async uniq(input, options) {
        try {
            const results = await this.text.uniq(input, options);
            this.emit('operationComplete', { operation: 'uniq', input, results });
            return results.join('\n');
        }
        catch (error) {
            this.emit('error', error);
            if (this.config.fatal)
                throw error;
            throw error;
        }
    }
    async wc(files) {
        try {
            const results = await this.text.wc(files);
            this.emit('operationComplete', { operation: 'wc', files, results });
            return results;
        }
        catch (error) {
            this.emit('error', error);
            if (this.config.fatal)
                throw error;
            throw error;
        }
    }
    // Pipeline operations
    pipeline(options) {
        return new pipeline_js_1.Pipeline(this, {
            parallel: this.config.parallel,
            verbose: this.config.verbose,
            ...options
        });
    }
    filePipeline(options) {
        return new pipeline_js_1.FilePipeline(this, {
            parallel: this.config.parallel,
            verbose: this.config.verbose,
            ...options
        });
    }
    textPipeline(options) {
        return new pipeline_js_1.TextPipeline(this, {
            parallel: this.config.parallel,
            verbose: this.config.verbose,
            ...options
        });
    }
    // Fluent API support
    find(pattern) {
        return this.filePipeline().find(pattern);
    }
    // Utility methods
    clearCache() {
        utils_js_1.globalPathCache.clear();
        this.emit('cacheCleared');
    }
    getStats() {
        return {
            cacheSize: utils_js_1.globalPathCache.size(),
            plugins: this.plugins.listPlugins().map(p => p.name),
            config: this.getConfig()
        };
    }
    // Event-based operations
    on(event, listener) {
        return super.on(event, listener);
    }
    // File watching capabilities
    watch(paths, options) {
        const watchOptions = {
            cwd: this.config.cwd,
            ...options
        };
        const watcher = (0, watch_js_1.createWatcher)(paths, watchOptions, this.config);
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
            if (this.config.fatal)
                throw error;
        });
        watcher.on('ready', () => {
            this.emit('watchReady', { paths, options: watchOptions });
        });
        return watcher;
    }
    // Transaction support with rollback capabilities
    async transaction(fn, options) {
        const tx = this.transactionManager.begin(options);
        try {
            const result = await fn(tx);
            if (!options?.autoCommit) {
                await tx.commit();
            }
            return result;
        }
        catch (error) {
            await tx.rollback();
            throw error;
        }
    }
}
exports.Shell = Shell;
// Factory function for creating shell instances
function createShell(config) {
    return new Shell(config);
}
// Default instance
exports.shell = createShell();
//# sourceMappingURL=shell.js.map