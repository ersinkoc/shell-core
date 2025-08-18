"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = exports.createTransactionManager = exports.TransactionManager = exports.Transaction = exports.createHotReloader = exports.HotReloader = exports.FileWatcherImpl = exports.createWatcher = exports.TextOperations = exports.ProcessOperations = exports.FileSystemOperations = exports.globalPathCache = exports.PathCache = exports.formatDuration = exports.formatBytes = exports.createPathMatcher = exports.getRelativePath = exports.isSubpath = exports.removeTrailingSeparator = exports.ensureTrailingSeparator = exports.changeExtension = exports.getExtension = exports.getBasename = exports.getParentDir = exports.joinPaths = exports.parsePath = exports.getFileInfo = exports.isExecutable = exports.isWritable = exports.isReadable = exports.pathExists = exports.validatePath = exports.resolvePath = exports.normalizePath = exports.isUnix = exports.isWindows = exports.TextPipeline = exports.FilePipeline = exports.Pipeline = exports.GitPlugin = exports.BasePlugin = exports.PluginManager = exports.createDefaultRetryOptions = exports.withRetry = exports.isRecoverableError = exports.OperationCancelledError = exports.ShellError = exports.shell = exports.createShell = exports.Shell = void 0;
exports.PACKAGE_NAME = void 0;
// Main exports
var shell_js_1 = require("./shell.js");
Object.defineProperty(exports, "Shell", { enumerable: true, get: function () { return shell_js_1.Shell; } });
Object.defineProperty(exports, "createShell", { enumerable: true, get: function () { return shell_js_1.createShell; } });
Object.defineProperty(exports, "shell", { enumerable: true, get: function () { return shell_js_1.shell; } });
// Error exports
var errors_js_1 = require("./errors.js");
Object.defineProperty(exports, "ShellError", { enumerable: true, get: function () { return errors_js_1.ShellError; } });
Object.defineProperty(exports, "OperationCancelledError", { enumerable: true, get: function () { return errors_js_1.OperationCancelledError; } });
Object.defineProperty(exports, "isRecoverableError", { enumerable: true, get: function () { return errors_js_1.isRecoverableError; } });
Object.defineProperty(exports, "withRetry", { enumerable: true, get: function () { return errors_js_1.withRetry; } });
Object.defineProperty(exports, "createDefaultRetryOptions", { enumerable: true, get: function () { return errors_js_1.createDefaultRetryOptions; } });
// Plugin exports
var plugins_js_1 = require("./plugins.js");
Object.defineProperty(exports, "PluginManager", { enumerable: true, get: function () { return plugins_js_1.PluginManager; } });
Object.defineProperty(exports, "BasePlugin", { enumerable: true, get: function () { return plugins_js_1.BasePlugin; } });
Object.defineProperty(exports, "GitPlugin", { enumerable: true, get: function () { return plugins_js_1.GitPlugin; } });
// Pipeline exports
var pipeline_js_1 = require("./pipeline.js");
Object.defineProperty(exports, "Pipeline", { enumerable: true, get: function () { return pipeline_js_1.Pipeline; } });
Object.defineProperty(exports, "FilePipeline", { enumerable: true, get: function () { return pipeline_js_1.FilePipeline; } });
Object.defineProperty(exports, "TextPipeline", { enumerable: true, get: function () { return pipeline_js_1.TextPipeline; } });
// Utility exports
var utils_js_1 = require("./utils.js");
Object.defineProperty(exports, "isWindows", { enumerable: true, get: function () { return utils_js_1.isWindows; } });
Object.defineProperty(exports, "isUnix", { enumerable: true, get: function () { return utils_js_1.isUnix; } });
Object.defineProperty(exports, "normalizePath", { enumerable: true, get: function () { return utils_js_1.normalizePath; } });
Object.defineProperty(exports, "resolvePath", { enumerable: true, get: function () { return utils_js_1.resolvePath; } });
Object.defineProperty(exports, "validatePath", { enumerable: true, get: function () { return utils_js_1.validatePath; } });
Object.defineProperty(exports, "pathExists", { enumerable: true, get: function () { return utils_js_1.pathExists; } });
Object.defineProperty(exports, "isReadable", { enumerable: true, get: function () { return utils_js_1.isReadable; } });
Object.defineProperty(exports, "isWritable", { enumerable: true, get: function () { return utils_js_1.isWritable; } });
Object.defineProperty(exports, "isExecutable", { enumerable: true, get: function () { return utils_js_1.isExecutable; } });
Object.defineProperty(exports, "getFileInfo", { enumerable: true, get: function () { return utils_js_1.getFileInfo; } });
Object.defineProperty(exports, "parsePath", { enumerable: true, get: function () { return utils_js_1.parsePath; } });
Object.defineProperty(exports, "joinPaths", { enumerable: true, get: function () { return utils_js_1.joinPaths; } });
Object.defineProperty(exports, "getParentDir", { enumerable: true, get: function () { return utils_js_1.getParentDir; } });
Object.defineProperty(exports, "getBasename", { enumerable: true, get: function () { return utils_js_1.getBasename; } });
Object.defineProperty(exports, "getExtension", { enumerable: true, get: function () { return utils_js_1.getExtension; } });
Object.defineProperty(exports, "changeExtension", { enumerable: true, get: function () { return utils_js_1.changeExtension; } });
Object.defineProperty(exports, "ensureTrailingSeparator", { enumerable: true, get: function () { return utils_js_1.ensureTrailingSeparator; } });
Object.defineProperty(exports, "removeTrailingSeparator", { enumerable: true, get: function () { return utils_js_1.removeTrailingSeparator; } });
Object.defineProperty(exports, "isSubpath", { enumerable: true, get: function () { return utils_js_1.isSubpath; } });
Object.defineProperty(exports, "getRelativePath", { enumerable: true, get: function () { return utils_js_1.getRelativePath; } });
Object.defineProperty(exports, "createPathMatcher", { enumerable: true, get: function () { return utils_js_1.createPathMatcher; } });
Object.defineProperty(exports, "formatBytes", { enumerable: true, get: function () { return utils_js_1.formatBytes; } });
Object.defineProperty(exports, "formatDuration", { enumerable: true, get: function () { return utils_js_1.formatDuration; } });
Object.defineProperty(exports, "PathCache", { enumerable: true, get: function () { return utils_js_1.PathCache; } });
Object.defineProperty(exports, "globalPathCache", { enumerable: true, get: function () { return utils_js_1.globalPathCache; } });
// Module exports for advanced usage
var fs_js_1 = require("./fs.js");
Object.defineProperty(exports, "FileSystemOperations", { enumerable: true, get: function () { return fs_js_1.FileSystemOperations; } });
var process_js_1 = require("./process.js");
Object.defineProperty(exports, "ProcessOperations", { enumerable: true, get: function () { return process_js_1.ProcessOperations; } });
var text_js_1 = require("./text.js");
Object.defineProperty(exports, "TextOperations", { enumerable: true, get: function () { return text_js_1.TextOperations; } });
// Watch module exports
var watch_js_1 = require("./watch.js");
Object.defineProperty(exports, "createWatcher", { enumerable: true, get: function () { return watch_js_1.createWatcher; } });
Object.defineProperty(exports, "FileWatcherImpl", { enumerable: true, get: function () { return watch_js_1.FileWatcherImpl; } });
Object.defineProperty(exports, "HotReloader", { enumerable: true, get: function () { return watch_js_1.HotReloader; } });
Object.defineProperty(exports, "createHotReloader", { enumerable: true, get: function () { return watch_js_1.createHotReloader; } });
// Transaction module exports
var transaction_js_1 = require("./transaction.js");
Object.defineProperty(exports, "Transaction", { enumerable: true, get: function () { return transaction_js_1.Transaction; } });
Object.defineProperty(exports, "TransactionManager", { enumerable: true, get: function () { return transaction_js_1.TransactionManager; } });
Object.defineProperty(exports, "createTransactionManager", { enumerable: true, get: function () { return transaction_js_1.createTransactionManager; } });
// Version and metadata
exports.VERSION = '1.0.0';
exports.PACKAGE_NAME = '@oxog/shell-core';
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
const shell_js_2 = require("./shell.js");
const defaultShell = new shell_js_2.Shell();
exports.default = defaultShell;
//# sourceMappingURL=index.js.map