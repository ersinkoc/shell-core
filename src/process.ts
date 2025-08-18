import { exec as nodeExec, spawn as nodeSpawn } from 'child_process';
import { promisify } from 'util';
// import { platform } from 'os';
import type { ExecOptions, SpawnOptions, CommandResult } from './types.js';
import { ShellError, withRetry } from './errors.js';
import { resolvePath, isWindows } from './utils.js';

const execAsync = promisify(nodeExec);

export class ProcessOperations {
  public async exec(command: string, options: ExecOptions = {}): Promise<CommandResult> {
    if (!command || typeof command !== 'string') {
      throw new ShellError(
        'Command must be a non-empty string',
        'INVALID_OPERATION',
        'exec'
      );
    }

    if (options.retry) {
      // With retry, use a wrapper that throws on failure
      const operation = async (): Promise<CommandResult> => {
        const startTime = Date.now();
        const result = await this.execImpl(command, options, startTime);
        if (!result.success) {
          throw ShellError.commandFailed(command, result.code, result.stderr);
        }
        return result;
      };
      
      return await withRetry(operation, options.retry, 'exec');
    } else {
      // Without retry, just return the result (success or failure)
      const startTime = Date.now();
      return await this.execImpl(command, options, startTime);
    }
  }

  private async execImpl(command: string, options: ExecOptions, startTime: number): Promise<CommandResult> {
    const execOptions = {
      cwd: options.cwd ? resolvePath(options.cwd) : process.cwd(),
      env: { ...process.env, ...options.env },
      timeout: options.timeout ?? 30000,
      maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024, // 10MB
      encoding: options.encoding ?? 'utf8' as BufferEncoding,
      shell: options.shell ?? true,
      signal: options.signal,
      windowsHide: isWindows() ? true : undefined
    };

    try {
      const result = await execAsync(command, execOptions as any);
      const duration = Date.now() - startTime;
      
      if (!options.silent) {
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
      }

      return {
        stdout: (result.stdout || '').toString(),
        stderr: (result.stderr || '').toString(),
        code: 0,
        signal: null,
        success: true,
        duration
      };
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
        code?: number;
        signal?: string;
      };
      
      const duration = Date.now() - startTime;
      const stdout = nodeError.stdout || '';
      const stderr = nodeError.stderr || '';
      const exitCode = nodeError.code ?? 1;
      const signal = nodeError.signal || null;

      if (!options.silent) {
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);
      }

      const result: CommandResult = {
        stdout,
        stderr,
        code: exitCode,
        signal,
        success: false,
        duration
      };

      // Handle different error types
      if (nodeError.code === 'ENOENT') {
        throw new ShellError(
          `Command not found: ${command}`,
          'ENOENT',
          'exec',
          undefined,
          undefined,
          undefined,
          { command, ...result }
        );
      } else if (nodeError.code === 'ETIMEOUT') {
        throw ShellError.timeout('exec', options.timeout ?? 30000);
      } else if (typeof nodeError.code === 'number' && nodeError.code !== 0) {
        // Return the result for non-zero exit codes
        return result;
      } else {
        throw ShellError.fromNodeError(nodeError, 'exec');
      }
    }
  }

  public async spawn(
    command: string, 
    args: readonly string[] = [], 
    options: SpawnOptions = {}
  ): Promise<CommandResult> {
    if (!command || typeof command !== 'string') {
      throw new ShellError(
        'Command must be a non-empty string',
        'INVALID_OPERATION',
        'spawn'
      );
    }

    const startTime = Date.now();
    
    const operation = async (): Promise<CommandResult> => {
      return await this.spawnImpl(command, args, options, startTime);
    };

    if (options.retry) {
      return await withRetry(operation, options.retry, 'spawn');
    } else {
      return await operation();
    }
  }

  private async spawnImpl(
    command: string,
    args: readonly string[],
    options: SpawnOptions,
    startTime: number
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const spawnOptions = {
        cwd: options.cwd ? resolvePath(options.cwd) : process.cwd(),
        env: { ...process.env, ...options.env },
        stdio: options.stdio ?? 'pipe' as const,
        shell: options.shell ?? false,
        detached: options.detached ?? false,
        windowsHide: options.windowsHide ?? (isWindows() ? true : undefined),
        signal: options.signal
      };

      // Handle shell option for cross-platform compatibility
      let actualCommand = command;
      let actualArgs = [...args];
      
      if (spawnOptions.shell === true) {
        if (isWindows()) {
          actualCommand = 'cmd';
          actualArgs = ['/c', `${command} ${args.join(' ')}`];
        } else {
          actualCommand = '/bin/sh';
          actualArgs = ['-c', `${command} ${args.join(' ')}`];
        }
      }

      const child = nodeSpawn(actualCommand, actualArgs, spawnOptions as any);
      
      let stdout = '';
      let stderr = '';
      let timeoutHandle: NodeJS.Timeout | undefined;

      // Set up timeout
      if (options.timeout) {
        timeoutHandle = setTimeout(() => {
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 5000); // Grace period before SIGKILL
        }, options.timeout);
      }

      // Handle input if provided
      if (options.input && child.stdin) {
        child.stdin.write(options.input);
        child.stdin.end();
      }

      // Handle stdout
      if (child.stdout) {
        child.stdout.setEncoding(options.encoding ?? 'utf8');
        child.stdout.on('data', (data: string) => {
          stdout += data;
          if (!options.silent) {
            process.stdout.write(data);
          }
        });
      }

      // Handle stderr
      if (child.stderr) {
        child.stderr.setEncoding(options.encoding ?? 'utf8');
        child.stderr.on('data', (data: string) => {
          stderr += data;
          if (!options.silent) {
            process.stderr.write(data);
          }
        });
      }

      // Handle process completion
      child.on('close', (code, signal) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const duration = Date.now() - startTime;
        const result: CommandResult = {
          stdout,
          stderr,
          code: code ?? 0,
          signal: signal || null,
          success: code === 0,
          duration
        };

        resolve(result);
      });

      // Handle errors
      child.on('error', (error) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const nodeError = error as NodeJS.ErrnoException;
        
        if (nodeError.code === 'ENOENT') {
          reject(new ShellError(
            `Command not found: ${actualCommand}`,
            'ENOENT',
            'spawn',
            undefined,
            undefined,
            undefined,
            { command: actualCommand, args: actualArgs }
          ));
        } else {
          reject(ShellError.fromNodeError(nodeError, 'spawn'));
        }
      });
    });
  }

  public async which(command: string): Promise<string | null> {
    if (!command || typeof command !== 'string') {
      return null;
    }

    // Use built-in where/which command for better performance
    try {
      const result = await this.exec(
        isWindows() 
          ? `where ${command}` 
          : `which ${command}`,
        { silent: true, timeout: 2000 }
      );
      
      if (result.success && result.stdout.trim()) {
        // Return the first match
        const lines = result.stdout.trim().split('\n');
        return lines[0].trim();
      }
    } catch {
      // Command not found
    }
    
    return null;
  }

  public async parallel(
    commands: readonly string[] | readonly { command: string; args?: readonly string[]; options?: SpawnOptions }[],
    options: { concurrency?: number; failFast?: boolean } = {}
  ): Promise<CommandResult[]> {
    const concurrency = options.concurrency ?? 4;
    const failFast = options.failFast ?? false;
    
    if (commands.length === 0) {
      return [];
    }

    const results: CommandResult[] = [];
    const errors: Error[] = [];
    let completed = 0;

    return new Promise((resolve, reject) => {
      let running = 0;
      let index = 0;

      const executeNext = async (): Promise<void> => {
        if (index >= commands.length || (failFast && errors.length > 0)) {
          return;
        }

        const currentIndex = index++;
        const cmd = commands[currentIndex]!;
        running++;

        try {
          const result = typeof cmd === 'string' 
            ? await this.exec(cmd)
            : await this.spawn(cmd.command, cmd.args, cmd.options);
          
          results[currentIndex] = result;
          
          if (!result.success && failFast) {
            errors.push(ShellError.commandFailed(
              typeof cmd === 'string' ? cmd : cmd.command,
              result.code,
              result.stderr
            ));
          }
        } catch (error) {
          errors.push(error as Error);
          if (failFast) {
            reject(errors[0]);
            return;
          }
        } finally {
          running--;
          completed++;
          
          if (completed === commands.length) {
            if (errors.length > 0 && failFast) {
              reject(errors[0]);
            } else {
              resolve(results);
            }
          } else if (running < concurrency) {
            void executeNext();
          }
        }
      };

      // Start initial batch
      for (let i = 0; i < Math.min(concurrency, commands.length); i++) {
        void executeNext();
      }
    });
  }

  public async kill(pid: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<boolean> {
    try {
      process.kill(pid, signal);
      return true;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ESRCH') {
        return false; // Process doesn't exist
      }
      throw ShellError.fromNodeError(nodeError, 'kill');
    }
  }

  public async killall(processName: string, signal: NodeJS.Signals = 'SIGTERM'): Promise<number> {
    const command = isWindows()
      ? `taskkill /F /IM "${processName}"`
      : `pkill -${signal.replace('SIG', '')} "${processName}"`;
    
    try {
      const result = await this.exec(command, { silent: true });
      return result.success ? 1 : 0; // Simplified count
    } catch {
      return 0;
    }
  }
}