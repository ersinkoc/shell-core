import type { IShellPlugin, CommandHandler, FilterHandler, TransformHandler } from './types.js';
import { ShellError } from './errors.js';

export class PluginManager {
  private readonly plugins = new Map<string, IShellPlugin>();
  private readonly commands = new Map<string, CommandHandler>();
  private readonly filters = new Map<string, FilterHandler>();
  private readonly transformers = new Map<string, TransformHandler>();
  private readonly shellInstance: unknown;

  constructor(shellInstance: unknown) {
    this.shellInstance = shellInstance;
  }

  public use(plugin: IShellPlugin): void {
    if (!plugin.name || !plugin.version) {
      throw new ShellError(
        'Plugin must have name and version properties',
        'PLUGIN_ERROR',
        'use'
      );
    }

    if (this.plugins.has(plugin.name)) {
      throw new ShellError(
        `Plugin '${plugin.name}' is already installed`,
        'PLUGIN_ERROR',
        'use'
      );
    }

    try {
      // Install plugin
      plugin.install(this.shellInstance as any);
      
      // Register commands
      if (plugin.commands) {
        for (const [name, handler] of Object.entries(plugin.commands)) {
          if (this.commands.has(name)) {
            const shell = this.shellInstance as any;
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
            const shell = this.shellInstance as any;
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
            const shell = this.shellInstance as any;
            if (!shell?.getConfig?.()?.silent) {
              console.warn(`Warning: Transformer '${name}' is already registered and will be overridden`);
            }
          }
          this.transformers.set(name, handler);
        }
      }
      
      this.plugins.set(plugin.name, plugin);
    } catch (error) {
      throw new ShellError(
        `Failed to install plugin '${plugin.name}': ${error instanceof Error ? error.message : String(error)}`,
        'PLUGIN_ERROR',
        'use',
        undefined,
        undefined,
        undefined,
        error
      );
    }
  }

  public unuse(pluginName: string): void {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new ShellError(
        `Plugin '${pluginName}' is not installed`,
        'PLUGIN_ERROR',
        'unuse'
      );
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
    } catch (error) {
      throw new ShellError(
        `Failed to uninstall plugin '${pluginName}': ${error instanceof Error ? error.message : String(error)}`,
        'PLUGIN_ERROR',
        'unuse',
        undefined,
        undefined,
        undefined,
        error
      );
    }
  }

  public getPlugin(name: string): IShellPlugin | undefined {
    return this.plugins.get(name);
  }
  
  public getPluginInfo(name: string): any {
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

  public listPlugins(): readonly IShellPlugin[] {
    return Array.from(this.plugins.values());
  }

  public hasCommand(name: string): boolean {
    return this.commands.has(name);
  }

  public getCommand(name: string): CommandHandler | undefined {
    return this.commands.get(name);
  }

  public async executeCommand(name: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.commands.get(name);
    if (!handler) {
      throw new ShellError(
        `Command '${name}' not found`,
        'PLUGIN_ERROR',
        'executeCommand'
      );
    }

    try {
      return await handler(...args);
    } catch (error) {
      throw new ShellError(
        `Command '${name}' failed: ${error instanceof Error ? error.message : String(error)}`,
        'PLUGIN_ERROR',
        'executeCommand',
        undefined,
        undefined,
        undefined,
        error
      );
    }
  }

  public hasFilter(name: string): boolean {
    return this.filters.has(name);
  }

  public getFilter(name: string): FilterHandler | undefined {
    return this.filters.get(name);
  }

  public applyFilter(name: string, input: unknown): boolean {
    const handler = this.filters.get(name);
    if (!handler) {
      throw new ShellError(
        `Filter '${name}' not found`,
        'PLUGIN_ERROR',
        'applyFilter'
      );
    }

    try {
      return handler(input);
    } catch (error) {
      throw new ShellError(
        `Filter '${name}' failed: ${error instanceof Error ? error.message : String(error)}`,
        'PLUGIN_ERROR',
        'applyFilter',
        undefined,
        undefined,
        undefined,
        error
      );
    }
  }

  public hasTransformer(name: string): boolean {
    return this.transformers.has(name);
  }

  public getTransformer(name: string, ...args: any[]): (input: any) => any {
    const handler = this.transformers.get(name);
    if (!handler) {
      throw new ShellError(
        `Transformer '${name}' not found`,
        'PLUGIN_ERROR',
        'getTransformer'
      );
    }
    
    // If transformer is a factory function that takes args and returns a function
    if (args.length > 0) {
      const result = handler(...args);
      if (typeof result === 'function') {
        return result;
      }
      throw new ShellError(
        `Transformer '${name}' with arguments did not return a function`,
        'PLUGIN_ERROR',
        'getTransformer'
      );
    }
    
    // Otherwise, return the transformer directly if it's a function
    if (typeof handler === 'function') {
      return handler as (input: any) => any;
    }
    
    throw new ShellError(
      `Transformer '${name}' is not a function`,
      'PLUGIN_ERROR',
      'getTransformer'
    );
  }

  public applyTransformer(name: string, input: unknown): unknown {
    const handler = this.transformers.get(name);
    if (!handler) {
      throw new ShellError(
        `Transformer '${name}' not found`,
        'PLUGIN_ERROR',
        'applyTransformer'
      );
    }

    try {
      return handler(input);
    } catch (error) {
      throw new ShellError(
        `Transformer '${name}' failed: ${error instanceof Error ? error.message : String(error)}`,
        'PLUGIN_ERROR',
        'applyTransformer',
        undefined,
        undefined,
        undefined,
        error
      );
    }
  }

  public getCommands(): readonly string[] {
    return Array.from(this.commands.keys());
  }

  public getFilters(): readonly string[] {
    return Array.from(this.filters.keys());
  }

  public getTransformers(): readonly string[] {
    return Array.from(this.transformers.keys());
  }
}

// Base plugin class for easier plugin development
export abstract class BasePlugin implements IShellPlugin {
  public abstract readonly name: string;
  public abstract readonly version: string;
  
  public commands?: Record<string, CommandHandler>;
  public filters?: Record<string, FilterHandler>;
  public transformers?: Record<string, TransformHandler>;

  protected shell?: any;

  public install(shell: any): void {
    this.shell = shell;
    this.onInstall(shell);
  }

  public uninstall(): void {
    if (this.shell) {
      this.onUninstall(this.shell);
    }
    this.shell = undefined;
  }

  protected onInstall(_shell: any): void {
    // Override in subclasses
  }

  protected onUninstall(_shell?: any): void {
    // Override in subclasses
  }
}

// BUG-006 FIX: Example git plugin implementation with secure command execution
// All commands now use spawn() with array arguments to prevent command injection
export class GitPlugin extends BasePlugin {
  public readonly name = 'git';
  public readonly version = '1.0.0';

  public override commands: Record<string, (...args: unknown[]) => Promise<unknown>> = {
    'git.status': async (): Promise<string> => {
      if (!this.shell) throw new Error('Plugin not installed');
      const result = await this.shell.spawn('git', ['status', '--porcelain']);
      return result.stdout;
    },

    'git.add': async (files: string | string[] = '.'): Promise<string> => {
      if (!this.shell) throw new Error('Plugin not installed');
      const fileList = Array.isArray(files) ? files : [files];
      const result = await this.shell.spawn('git', ['add', ...fileList]);
      return result.stdout;
    },

    'git.commit': async (message: string, options: { amend?: boolean } = {}): Promise<string> => {
      if (!this.shell) throw new Error('Plugin not installed');
      const args = ['commit'];
      if (options.amend) args.push('--amend');
      args.push('-m', message);
      const result = await this.shell.spawn('git', args);
      return result.stdout;
    },

    'git.push': async (remote = 'origin', branch?: string): Promise<string> => {
      if (!this.shell) throw new Error('Plugin not installed');
      const args = ['push', remote];
      if (branch) args.push(branch);
      const result = await this.shell.spawn('git', args);
      return result.stdout;
    },

    'git.pull': async (remote = 'origin', branch?: string): Promise<string> => {
      if (!this.shell) throw new Error('Plugin not installed');
      const args = ['pull', remote];
      if (branch) args.push(branch);
      const result = await this.shell.spawn('git', args);
      return result.stdout;
    },

    'git.branch': async (name?: string, options: { delete?: boolean; force?: boolean } = {}): Promise<string> => {
      if (!this.shell) throw new Error('Plugin not installed');
      const args = ['branch'];

      if (options.delete && name) {
        args.push(options.force ? '-D' : '-d', name);
      } else if (name) {
        args.push(name);
      }

      const result = await this.shell.spawn('git', args);
      return result.stdout;
    },

    'git.checkout': async (branch: string, options: { create?: boolean } = {}): Promise<string> => {
      if (!this.shell) throw new Error('Plugin not installed');
      const args = ['checkout'];
      if (options.create) args.push('-b');
      args.push(branch);
      const result = await this.shell.spawn('git', args);
      return result.stdout;
    },

    'git.log': async (options: { oneline?: boolean; graph?: boolean; all?: boolean; limit?: number } = {}): Promise<string> => {
      if (!this.shell) throw new Error('Plugin not installed');
      const args = ['log'];
      if (options.oneline) args.push('--oneline');
      if (options.graph) args.push('--graph');
      if (options.all) args.push('--all');
      if (options.limit) args.push(`-${options.limit}`);

      const result = await this.shell.spawn('git', args);
      return result.stdout;
    },

    'git.diff': async (files?: string | string[], options: { cached?: boolean; stat?: boolean } = {}): Promise<string> => {
      if (!this.shell) throw new Error('Plugin not installed');
      const args = ['diff'];
      if (options.cached) args.push('--cached');
      if (options.stat) args.push('--stat');
      if (files) {
        const fileList = Array.isArray(files) ? files : [files];
        args.push(...fileList);
      }

      const result = await this.shell.spawn('git', args);
      return result.stdout;
    }
  };

  protected override onInstall(shell: any): void {
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

  protected override onUninstall(): void {
    if (this.shell && this.shell.git) {
      delete this.shell.git;
    }
  }
}