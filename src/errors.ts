import type { ErrorCode, RetryOptions } from './types.js';

export class ShellError extends Error {
  public readonly timestamp: Date;

  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly operation: string,
    public readonly path?: string,
    public readonly syscall?: string,
    public readonly errno?: number,
    public readonly details?: unknown,
    public readonly recoverable: boolean = false
  ) {
    super(message);
    this.name = 'ShellError';
    this.timestamp = new Date();
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ShellError);
    }
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      operation: this.operation,
      path: this.path,
      syscall: this.syscall,
      errno: this.errno,
      details: this.details,
      recoverable: this.recoverable,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack
    };
  }

  public static fromNodeError(error: NodeJS.ErrnoException, operation: string, path?: string): ShellError {
    const code = (error.code as ErrorCode) ?? 'INVALID_OPERATION';
    const recoverable = isRecoverableError(code);
    
    return new ShellError(
      error.message,
      code,
      operation,
      path ?? error.path,
      error.syscall,
      error.errno,
      error,
      recoverable
    );
  }

  public static timeout(operation: string, timeout: number, path?: string): ShellError {
    return new ShellError(
      `Operation '${operation}' timed out after ${timeout}ms`,
      'TIMEOUT',
      operation,
      path,
      undefined,
      undefined,
      { timeout },
      false
    );
  }

  public static invalidPath(path: string, operation: string): ShellError {
    return new ShellError(
      `Invalid path: ${path}`,
      'INVALID_PATH',
      operation,
      path,
      undefined,
      undefined,
      undefined,
      false
    );
  }

  public static permissionDenied(path: string, operation: string): ShellError {
    return new ShellError(
      `Permission denied: ${path}`,
      'PERMISSION_DENIED',
      operation,
      path,
      undefined,
      undefined,
      undefined,
      true
    );
  }

  public static commandFailed(command: string, code: number, stderr: string): ShellError {
    return new ShellError(
      `Command failed with exit code ${code}: ${command}`,
      'COMMAND_FAILED',
      'exec',
      undefined,
      undefined,
      code,
      { command, stderr },
      false
    );
  }
}

export function isRecoverableError(code: ErrorCode): boolean {
  const recoverableCodes: readonly ErrorCode[] = [
    'EBUSY',
    'EMFILE',
    'ENFILE',
    'ENOSPC',
    'NETWORK_ERROR',
    'TIMEOUT'
  ] as const;
  
  return recoverableCodes.includes(code);
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
  operationName: string
): Promise<T> {
  let lastError: ShellError;
  
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const shellError = error instanceof ShellError 
        ? error 
        : new ShellError(
            error instanceof Error ? error.message : String(error),
            'INVALID_OPERATION',
            operationName
          );
      
      lastError = shellError;
      
      if (attempt === options.attempts) {
        throw shellError;
      }
      
      // Check if we should retry this error
      if (options.shouldRetry && !options.shouldRetry(shellError)) {
        throw shellError;
      }
      
      if (options.onRetry) {
        try {
          options.onRetry(attempt, shellError);
        } catch (callbackError) {
          // Continue with retry even if callback fails
        }
      }
      
      const backoff = options.backoff ?? 1;
      const delay = options.delay * Math.pow(backoff, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

export function createDefaultRetryOptions(): RetryOptions {
  return {
    attempts: 3,
    delay: 1000,
    backoff: 2,
    shouldRetry: (error) => (error as any).recoverable,
    onRetry: () => {}
  };
}

export class OperationCancelledError extends ShellError {
  constructor(operation: string, path?: string) {
    super(
      `Operation '${operation}' was cancelled`,
      'CANCELLED',
      operation,
      path,
      undefined,
      undefined,
      undefined,
      false
    );
    this.name = 'OperationCancelledError';
  }
}