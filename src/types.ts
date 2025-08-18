export type ErrorCode = 
  | 'ENOENT' 
  | 'EACCES' 
  | 'EEXIST' 
  | 'ENOTDIR' 
  | 'EISDIR' 
  | 'EMFILE' 
  | 'ENFILE' 
  | 'ENOTEMPTY' 
  | 'EBUSY' 
  | 'EXDEV' 
  | 'ENOSPC' 
  | 'EROFS' 
  | 'ELOOP' 
  | 'ENAMETOOLONG'
  | 'EINVAL'
  | 'INVALID_PATH'
  | 'INVALID_OPERATION'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'PERMISSION_DENIED'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'COMMAND_FAILED'
  | 'PLUGIN_ERROR';

export interface RetryOptions {
  readonly attempts: number;
  readonly delay: number;
  readonly backoff: number;
  readonly shouldRetry?: (error: Error) => boolean;
  readonly onRetry?: (attempt: number, error: Error) => void;
}

export interface ProgressCallback {
  (current: number, total: number): void;
}

export interface CopyOptions {
  readonly recursive?: boolean;
  readonly preserve?: boolean;
  readonly update?: boolean;
  readonly noClobber?: boolean;
  readonly followSymlinks?: boolean;
  readonly retry?: RetryOptions;
  readonly onProgress?: ProgressCallback;
}

export interface MoveOptions {
  readonly atomic?: boolean;
  readonly noClobber?: boolean;
  readonly retry?: RetryOptions;
  readonly onProgress?: ProgressCallback;
}

export interface RemoveOptions {
  readonly recursive?: boolean;
  readonly force?: boolean;
  readonly trash?: boolean;
  readonly retry?: RetryOptions;
  readonly onProgress?: ProgressCallback;
}

export interface MkdirOptions {
  readonly recursive?: boolean;
  readonly mode?: number;
  readonly retry?: RetryOptions;
}

export interface TouchOptions {
  readonly atime?: Date;
  readonly mtime?: Date;
  readonly mode?: number;
  readonly retry?: RetryOptions;
}

export interface ExecOptions {
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly timeout?: number;
  readonly maxBuffer?: number;
  readonly encoding?: BufferEncoding;
  readonly shell?: boolean | string;
  readonly signal?: AbortSignal;
  readonly retry?: RetryOptions;
  readonly silent?: boolean;
}

export interface SpawnOptions extends ExecOptions {
  readonly stdio?: 'pipe' | 'inherit' | 'ignore' | readonly ['pipe' | 'inherit' | 'ignore', 'pipe' | 'inherit' | 'ignore', 'pipe' | 'inherit' | 'ignore'];
  readonly detached?: boolean;
  readonly windowsHide?: boolean;
  readonly killSignal?: NodeJS.Signals | number;
  readonly input?: string | Buffer;
}

export interface GrepOptions {
  readonly ignoreCase?: boolean;
  readonly invert?: boolean;
  readonly lineNumber?: boolean;
  readonly count?: boolean;
  readonly multiline?: boolean;
  readonly maxMatches?: number;
  readonly context?: number;
  readonly beforeContext?: number;
  readonly afterContext?: number;
}

export interface WatchOptions {
  readonly persistent?: boolean;
  readonly recursive?: boolean;
  readonly encoding?: BufferEncoding;
  readonly ignoreInitial?: boolean;
  readonly followSymlinks?: boolean;
  readonly cwd?: string;
  readonly ignorePermissionErrors?: boolean;
  readonly usePolling?: boolean;
  readonly interval?: number;
  readonly binaryInterval?: number;
  readonly depth?: number;
  readonly awaitWriteFinish?: boolean | {
    readonly stabilityThreshold?: number;
    readonly pollInterval?: number;
  };
  readonly ignored?: string | RegExp | ((path: string, stats?: any) => boolean);
  readonly atomic?: boolean;
}

export type WatchEventType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'ready' | 'error';

export interface WatchEvent {
  readonly type: WatchEventType;
  readonly path: string;
  readonly stats?: any;
}

export interface FileWatcher {
  on(event: WatchEventType, listener: (path: string, stats?: any) => void): FileWatcher;
  once(event: WatchEventType, listener: (path: string, stats?: any) => void): FileWatcher;
  removeListener(event: WatchEventType, listener: (path: string, stats?: any) => void): FileWatcher;
  removeAllListeners(event?: WatchEventType): FileWatcher;
  close(): Promise<void>;
  add(paths: string | readonly string[]): FileWatcher;
  unwatch(paths: string | readonly string[]): FileWatcher;
  getWatched(): Record<string, string[]>;
}

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
  readonly signal: string | null;
  readonly success: boolean;
  readonly duration: number;
}

export interface FileInfo {
  readonly path: string;
  readonly size: number;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly isSymlink: boolean;
  readonly mode: number;
  readonly atime: Date;
  readonly mtime: Date;
  readonly ctime: Date;
}

export interface ShellConfig {
  silent?: boolean;
  fatal?: boolean;
  verbose?: boolean;
  color?: boolean;
  maxBuffer?: number;
  timeout?: number;
  retries?: number;
  cwd?: string;
  env?: Record<string, string>;
  shell?: boolean | string;
  encoding?: BufferEncoding;
  trash?: boolean;
  cache?: boolean;
  parallel?: number;
}

export interface IShellPlugin {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly commands?: Record<string, CommandHandler>;
  readonly filters?: Record<string, FilterHandler>;
  readonly transformers?: Record<string, TransformHandler>;
  install(shell: ShellCore): void;
  uninstall(): void;
}

export type CommandHandler = (...args: unknown[]) => Promise<unknown>;
export type FilterHandler = (input: unknown) => boolean;
export type TransformHandler = (...args: any[]) => any;

export interface TransactionOptions {
  readonly autoCommit?: boolean;
  readonly backupDir?: string;
  readonly maxRetries?: number;
  readonly timeout?: number;
  readonly dryRun?: boolean;
  readonly onProgress?: (step: any, total: number, current: number) => void;
  readonly onRollback?: (step: any) => void;
}

export interface ShellCore {
  configure(config: Partial<ShellConfig>): void;
  use(plugin: IShellPlugin): void;
  copy(source: string, dest: string, options?: CopyOptions): Promise<void>;
  move(source: string, dest: string, options?: MoveOptions): Promise<void>;
  remove(path: string, options?: RemoveOptions): Promise<void>;
  mkdir(path: string, options?: MkdirOptions): Promise<void>;
  touch(path: string, options?: TouchOptions): Promise<void>;
  exec(command: string, options?: ExecOptions): Promise<CommandResult>;
  spawn(command: string, args?: readonly string[], options?: SpawnOptions): Promise<CommandResult>;
  grep(pattern: string | RegExp, files: string | readonly string[], options?: GrepOptions): Promise<string[]>;
  watch(paths: string | readonly string[], options?: WatchOptions): FileWatcher;
  transaction<T>(fn: (tx: any) => Promise<T>, options?: TransactionOptions): Promise<T>;
}

// Forward declaration
export interface ShellError extends Error {
  readonly code: ErrorCode;
  readonly operation: string;
  readonly path?: string;
  readonly recoverable: boolean;
}