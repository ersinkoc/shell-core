import { ShellError } from './errors.js';
export class PluginManager {
    plugins = new Map();
    commands = new Map();
    filters = new Map();
    transformers = new Map();
    shellInstance;
    constructor(shellInstance) {
        this.shellInstance = shellInstance;
    }
    use(plugin) {
        if (!plugin.name || !plugin.version) {
            throw new ShellError('Plugin must have name and version properties', 'PLUGIN_ERROR', 'use');
        }
        if (this.plugins.has(plugin.name)) {
            throw new ShellError(`Plugin '${plugin.name}' is already installed`, 'PLUGIN_ERROR', 'use');
        }
        try {
            // Install plugin
            plugin.install(this.shellInstance);
            // Register commands
            if (plugin.commands) {
                for (const [name, handler] of Object.entries(plugin.commands)) {
                    if (this.commands.has(name)) {
                        const shell = this.shellInstance;
                        if (!shell?.getConfig?.()?.silent) {
                            console.warn(`Warning: Command '${name}' is already registered and will be overridden`);
                        }
                    }
                    this.commands.set(name, handler);
                }
            }
            // Register filters
            if (plugin.filters) {
                for (const [name, handler] of Object.entries(plugin.filters)) {
                    if (this.filters.has(name)) {
                        const shell = this.shellInstance;
                        if (!shell?.getConfig?.()?.silent) {
                            console.warn(`Warning: Filter '${name}' is already registered and will be overridden`);
                        }
                    }
                    this.filters.set(name, handler);
                }
            }
            // Register transformers
            if (plugin.transformers) {
                for (const [name, handler] of Object.entries(plugin.transformers)) {
                    if (this.transformers.has(name)) {
                        const shell = this.shellInstance;
                        if (!shell?.getConfig?.()?.silent) {
                            console.warn(`Warning: Transformer '${name}' is already registered and will be overridden`);
                        }
                    }
                    this.transformers.set(name, handler);
                }
            }
            this.plugins.set(plugin.name, plugin);
        }
        catch (error) {
            throw new ShellError(`Failed to install plugin '${plugin.name}': ${error instanceof Error ? error.message : String(error)}`, 'PLUGIN_ERROR', 'use', undefined, undefined, undefined, error);
        }
    }
    unuse(pluginName) {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) {
            throw new ShellError(`Plugin '${pluginName}' is not installed`, 'PLUGIN_ERROR', 'unuse');
        }
        try {
            // Unregister commands
            if (plugin.commands && typeof plugin.commands === 'object') {
                for (const name of Object.keys(plugin.commands)) {
                    this.commands.delete(name);
                }
            }
            // Unregister filters
            if (plugin.filters && typeof plugin.filters === 'object') {
                for (const name of Object.keys(plugin.filters)) {
                    this.filters.delete(name);
                }
            }
            // Unregister transformers
            if (plugin.transformers && typeof plugin.transformers === 'object') {
                for (const name of Object.keys(plugin.transformers)) {
                    this.transformers.delete(name);
                }
            }
            // Uninstall plugin
            plugin.uninstall();
            this.plugins.delete(pluginName);
        }
        catch (error) {
            throw new ShellError(`Failed to uninstall plugin '${pluginName}': ${error instanceof Error ? error.message : String(error)}`, 'PLUGIN_ERROR', 'unuse', undefined, undefined, undefined, error);
        }
    }
    getPlugin(name) {
        return this.plugins.get(name);
    }
    getPluginInfo(name) {
        const plugin = this.plugins.get(name);
        if (!plugin) {
            return undefined;
        }
        return {
            name: plugin.name,
            version: plugin.version,
            description: plugin.description,
            commands: plugin.commands || {},
            filters: plugin.filters || {},
            transformers: plugin.transformers || {}
        };
    }
    listPlugins() {
        return Array.from(this.plugins.values());
    }
    hasCommand(name) {
        return this.commands.has(name);
    }
    getCommand(name) {
        return this.commands.get(name);
    }
    async executeCommand(name, ...args) {
        const handler = this.commands.get(name);
        if (!handler) {
            throw new ShellError(`Command '${name}' not found`, 'PLUGIN_ERROR', 'executeCommand');
        }
        try {
            return await handler(...args);
        }
        catch (error) {
            throw new ShellError(`Command '${name}' failed: ${error instanceof Error ? error.message : String(error)}`, 'PLUGIN_ERROR', 'executeCommand', undefined, undefined, undefined, error);
        }
    }
    hasFilter(name) {
        return this.filters.has(name);
    }
    getFilter(name) {
        return this.filters.get(name);
    }
    applyFilter(name, input) {
        const handler = this.filters.get(name);
        if (!handler) {
            throw new ShellError(`Filter '${name}' not found`, 'PLUGIN_ERROR', 'applyFilter');
        }
        try {
            return handler(input);
        }
        catch (error) {
            throw new ShellError(`Filter '${name}' failed: ${error instanceof Error ? error.message : String(error)}`, 'PLUGIN_ERROR', 'applyFilter', undefined, undefined, undefined, error);
        }
    }
    hasTransformer(name) {
        return this.transformers.has(name);
    }
    getTransformer(name, ...args) {
        const handler = this.transformers.get(name);
        if (!handler) {
            throw new ShellError(`Transformer '${name}' not found`, 'PLUGIN_ERROR', 'getTransformer');
        }
        // If transformer is a factory function that takes args and returns a function
        if (args.length > 0) {
            const result = handler(...args);
            if (typeof result === 'function') {
                return result;
            }
            throw new ShellError(`Transformer '${name}' with arguments did not return a function`, 'PLUGIN_ERROR', 'getTransformer');
        }
        // Otherwise, return the transformer directly if it's a function
        if (typeof handler === 'function') {
            return handler;
        }
        throw new ShellError(`Transformer '${name}' is not a function`, 'PLUGIN_ERROR', 'getTransformer');
    }
    applyTransformer(name, input) {
        const handler = this.transformers.get(name);
        if (!handler) {
            throw new ShellError(`Transformer '${name}' not found`, 'PLUGIN_ERROR', 'applyTransformer');
        }
        try {
            return handler(input);
        }
        catch (error) {
            throw new ShellError(`Transformer '${name}' failed: ${error instanceof Error ? error.message : String(error)}`, 'PLUGIN_ERROR', 'applyTransformer', undefined, undefined, undefined, error);
        }
    }
    getCommands() {
        return Array.from(this.commands.keys());
    }
    getFilters() {
        return Array.from(this.filters.keys());
    }
    getTransformers() {
        return Array.from(this.transformers.keys());
    }
}
// Base plugin class for easier plugin development
export class BasePlugin {
    commands;
    filters;
    transformers;
    shell;
    install(shell) {
        this.shell = shell;
        this.onInstall(shell);
    }
    uninstall() {
        if (this.shell) {
            this.onUninstall(this.shell);
        }
        this.shell = undefined;
    }
    onInstall(_shell) {
        // Override in subclasses
    }
    onUninstall(_shell) {
        // Override in subclasses
    }
}
// BUG-006 FIX: Example git plugin implementation with secure command execution
// All commands now use spawn() with array arguments to prevent command injection
export class GitPlugin extends BasePlugin {
    name = 'git';
    version = '1.0.0';
    commands = {
        'git.status': async () => {
            if (!this.shell)
                throw new Error('Plugin not installed');
            const result = await this.shell.spawn('git', ['status', '--porcelain']);
            return result.stdout;
        },
        'git.add': async (files = '.') => {
            if (!this.shell)
                throw new Error('Plugin not installed');
            const fileList = Array.isArray(files) ? files : [files];
            const result = await this.shell.spawn('git', ['add', ...fileList]);
            return result.stdout;
        },
        'git.commit': async (message, options = {}) => {
            if (!this.shell)
                throw new Error('Plugin not installed');
            const args = ['commit'];
            if (options.amend)
                args.push('--amend');
            args.push('-m', message);
            const result = await this.shell.spawn('git', args);
            return result.stdout;
        },
        'git.push': async (remote = 'origin', branch) => {
            if (!this.shell)
                throw new Error('Plugin not installed');
            const args = ['push', remote];
            if (branch)
                args.push(branch);
            const result = await this.shell.spawn('git', args);
            return result.stdout;
        },
        'git.pull': async (remote = 'origin', branch) => {
            if (!this.shell)
                throw new Error('Plugin not installed');
            const args = ['pull', remote];
            if (branch)
                args.push(branch);
            const result = await this.shell.spawn('git', args);
            return result.stdout;
        },
        'git.branch': async (name, options = {}) => {
            if (!this.shell)
                throw new Error('Plugin not installed');
            const args = ['branch'];
            if (options.delete && name) {
                args.push(options.force ? '-D' : '-d', name);
            }
            else if (name) {
                args.push(name);
            }
            const result = await this.shell.spawn('git', args);
            return result.stdout;
        },
        'git.checkout': async (branch, options = {}) => {
            if (!this.shell)
                throw new Error('Plugin not installed');
            const args = ['checkout'];
            if (options.create)
                args.push('-b');
            args.push(branch);
            const result = await this.shell.spawn('git', args);
            return result.stdout;
        },
        'git.log': async (options = {}) => {
            if (!this.shell)
                throw new Error('Plugin not installed');
            const args = ['log'];
            if (options.oneline)
                args.push('--oneline');
            if (options.graph)
                args.push('--graph');
            if (options.all)
                args.push('--all');
            if (options.limit)
                args.push(`-${options.limit}`);
            const result = await this.shell.spawn('git', args);
            return result.stdout;
        },
        'git.diff': async (files, options = {}) => {
            if (!this.shell)
                throw new Error('Plugin not installed');
            const args = ['diff'];
            if (options.cached)
                args.push('--cached');
            if (options.stat)
                args.push('--stat');
            if (files) {
                const fileList = Array.isArray(files) ? files : [files];
                args.push(...fileList);
            }
            const result = await this.shell.spawn('git', args);
            return result.stdout;
        }
    };
    onInstall(shell) {
        // Add git property to shell instance for fluent API
        if (!shell.git) {
            shell.git = {
                status: this.commands['git.status'],
                add: this.commands['git.add'],
                commit: this.commands['git.commit'],
                push: this.commands['git.push'],
                pull: this.commands['git.pull'],
                branch: this.commands['git.branch'],
                checkout: this.commands['git.checkout'],
                log: this.commands['git.log'],
                diff: this.commands['git.diff']
            };
        }
    }
    onUninstall() {
        if (this.shell && this.shell.git) {
            delete this.shell.git;
        }
    }
}
//# sourceMappingURL=plugins.js.map