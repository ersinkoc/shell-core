// Main exports
export { Shell, createShell, shell } from './shell.js';
// Error exports
export { ShellError, OperationCancelledError, isRecoverableError, withRetry, createDefaultRetryOptions } from './errors.js';
// Plugin exports
export { PluginManager, BasePlugin, GitPlugin } from './plugins.js';
// Pipeline exports
export { Pipeline, FilePipeline, TextPipeline } from './pipeline.js';
// Utility exports
export { isWindows, isUnix, normalizePath, resolvePath, validatePath, pathExists, isReadable, isWritable, isExecutable, getFileInfo, parsePath, joinPaths, getParentDir, getBasename, getExtension, changeExtension, ensureTrailingSeparator, removeTrailingSeparator, isSubpath, getRelativePath, createPathMatcher, formatBytes, formatDuration, PathCache, globalPathCache } from './utils.js';
// Module exports for advanced usage
export { FileSystemOperations } from './fs.js';
export { ProcessOperations } from './process.js';
export { TextOperations } from './text.js';
// Watch module exports
export { createWatcher, FileWatcherImpl, HotReloader, createHotReloader } from './watch.js';
// Transaction module exports
export { Transaction, TransactionManager, createTransactionManager } from './transaction.js';
// Version and metadata
export const VERSION = '1.0.0';
export const PACKAGE_NAME = '@oxog/shell-core';
// Quick start examples in JSDoc
/**
 * @example Basic file operations
 * ```typescript
 * import { shell } from '@oxog/shell-core';
 *
 * // Copy files
 * await shell.copy('source.txt', 'dest.txt');
 *
 * // Move directories
 * await shell.move('old-dir/', 'new-dir/');
 *
 * // Remove with options
 * await shell.remove('temp/', { recursive: true, force: true });
 * ```
 *
 * @example Command execution
 * ```typescript
 * import { shell } from '@oxog/shell-core';
 *
 * // Execute commands
 * const result = await shell.exec('ls -la');
 * console.log(result.stdout);
 *
 * // Spawn with arguments
 * const result2 = await shell.spawn('git', ['status', '--porcelain']);
 * ```
 *
 * @example Pipeline operations
 * ```typescript
 * import { shell } from '@oxog/shell-core';
 *
 * // File pipeline
 * await shell.find('src/**\/*.ts')
 *   .filterBySize(1000) // Files larger than 1KB
 *   .transform(async (file) => {
 *     // Process each file
 *     return file;
 *   })
 *   .copyTo('dist/')
 *   .execute();
 *
 * // Text pipeline
 * const lines = await shell.textPipeline()
 *   .grep(/error/i)
 *   .head(10)
 *   .sort({ ignoreCase: true })
 *   .execute(['log line 1', 'ERROR: failed', 'log line 2']);
 * ```
 *
 * @example Plugin usage
 * ```typescript
 * import { shell, GitPlugin } from '@oxog/shell-core';
 *
 * // Install git plugin
 * shell.use(new GitPlugin());
 *
 * // Use git commands
 * await shell.git.add('.');
 * await shell.git.commit('Initial commit');
 * await shell.git.push();
 * ```
 *
 * @example Configuration
 * ```typescript
 * import { createShell } from '@oxog/shell-core';
 *
 * const shell = createShell({
 *   silent: false,
 *   verbose: true,
 *   parallel: 8,
 *   timeout: 60000,
 *   retries: 5
 * });
 *
 * // Or configure existing instance
 * shell.configure({
 *   cwd: '/project',
 *   env: { NODE_ENV: 'production' }
 * });
 * ```
 *
 * @example File watching and hot reload
 * See examples/watch-demo.js for comprehensive file watching examples
 */
// Default export - create a default instance  
import { Shell } from './shell.js';
const defaultShell = new Shell();
export default defaultShell;
//# sourceMappingURL=index.js.map