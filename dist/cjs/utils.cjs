"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalPathCache = exports.PathCache = void 0;
exports.isWindows = isWindows;
exports.isUnix = isUnix;
exports.normalizePath = normalizePath;
exports.resolvePath = resolvePath;
exports.validatePath = validatePath;
exports.pathExists = pathExists;
exports.isReadable = isReadable;
exports.isWritable = isWritable;
exports.isExecutable = isExecutable;
exports.getFileInfo = getFileInfo;
exports.parsePath = parsePath;
exports.joinPaths = joinPaths;
exports.getParentDir = getParentDir;
exports.getBasename = getBasename;
exports.getExtension = getExtension;
exports.changeExtension = changeExtension;
exports.ensureTrailingSeparator = ensureTrailingSeparator;
exports.removeTrailingSeparator = removeTrailingSeparator;
exports.isSubpath = isSubpath;
exports.getRelativePath = getRelativePath;
exports.createPathMatcher = createPathMatcher;
exports.formatBytes = formatBytes;
exports.formatDuration = formatDuration;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const os_1 = require("os");
const errors_js_1 = require("./errors.js");
function isWindows() {
    return (0, os_1.platform)() === 'win32';
}
function isUnix() {
    return !isWindows();
}
function normalizePath(path) {
    if (!path) {
        throw errors_js_1.ShellError.invalidPath(path, 'normalize');
    }
    // Handle home directory expansion
    if (path.startsWith('~/')) {
        path = (0, path_1.join)((0, os_1.homedir)(), path.slice(2));
    }
    return (0, path_1.normalize)(path);
}
function resolvePath(path, basePath) {
    const normalizedPath = normalizePath(path);
    if ((0, path_1.isAbsolute)(normalizedPath)) {
        return normalizedPath;
    }
    return (0, path_1.resolve)(basePath ?? process.cwd(), normalizedPath);
}
function validatePath(path, operation) {
    if (!path || typeof path !== 'string' || path.trim() === '') {
        throw new errors_js_1.ShellError(`Invalid path for ${operation}`, 'EINVAL', operation, path);
    }
    // Check for null bytes and control characters
    if (/[\0\x01-\x1f]/.test(path)) {
        throw new errors_js_1.ShellError(`Invalid characters in path for ${operation}`, 'EINVAL', operation, path);
    }
    // Check for Windows-specific invalid characters
    if (isWindows()) {
        if (/[<>"|?*]/.test(path)) {
            throw new errors_js_1.ShellError(`Invalid characters in path for ${operation}`, 'EINVAL', operation, path);
        }
        // Check for reserved names
        const basename = path.split(/[/\\]/).pop()?.toUpperCase() || '';
        const reserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
        if (reserved.some(name => basename === name || basename.startsWith(name + '.'))) {
            throw new errors_js_1.ShellError(`Reserved name in path for ${operation}`, 'EINVAL', operation, path);
        }
    }
    // Check path length limits
    const maxPathLength = isWindows() ? 260 : 4096;
    if (path.length > maxPathLength) {
        throw new errors_js_1.ShellError(`Path too long: ${path.length} characters (max: ${maxPathLength})`, 'ENAMETOOLONG', operation, path);
    }
}
async function pathExists(path) {
    try {
        await (0, promises_1.access)(path, promises_1.constants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
async function isReadable(path) {
    try {
        await (0, promises_1.access)(path, promises_1.constants.R_OK);
        return true;
    }
    catch {
        return false;
    }
}
async function isWritable(path) {
    try {
        await (0, promises_1.access)(path, promises_1.constants.W_OK);
        return true;
    }
    catch {
        return false;
    }
}
async function isExecutable(path) {
    try {
        await (0, promises_1.access)(path, promises_1.constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
async function getFileInfo(path, followSymlinks = true) {
    const resolvedPath = resolvePath(path);
    try {
        const stats = followSymlinks ? await (0, promises_1.stat)(resolvedPath) : await (0, promises_1.lstat)(resolvedPath);
        return {
            path: resolvedPath,
            size: stats.size,
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
            isSymlink: stats.isSymbolicLink(),
            mode: stats.mode,
            atime: stats.atime,
            mtime: stats.mtime,
            ctime: stats.ctime
        };
    }
    catch (error) {
        throw errors_js_1.ShellError.fromNodeError(error, 'stat', resolvedPath);
    }
}
function parsePath(path) {
    return (0, path_1.parse)(normalizePath(path));
}
function joinPaths(...paths) {
    if (paths.length === 0)
        return '';
    return (0, path_1.normalize)((0, path_1.join)(...paths));
}
function getParentDir(path) {
    if (!path || path.trim() === '') {
        return '.';
    }
    const parsed = parsePath(path);
    return parsed.dir || '.';
}
function getBasename(path, ext) {
    const parsed = parsePath(path);
    return ext ? parsed.name : parsed.base;
}
function getExtension(path) {
    return parsePath(path).ext;
}
function changeExtension(path, newExt) {
    const parsed = parsePath(path);
    return (0, path_1.format)({
        ...parsed,
        base: undefined,
        ext: newExt.startsWith('.') ? newExt : `.${newExt}`
    });
}
function ensureTrailingSeparator(path) {
    return path.endsWith(path_1.sep) ? path : path + path_1.sep;
}
function removeTrailingSeparator(path) {
    if (path === path_1.sep)
        return '';
    return path.endsWith(path_1.sep) && path.length > 1 ? path.slice(0, -1) : path;
}
function isSubpath(parent, child) {
    const normalizedParent = resolvePath(parent);
    const normalizedChild = resolvePath(child);
    return normalizedChild.startsWith(ensureTrailingSeparator(normalizedParent));
}
function getRelativePath(from, to) {
    const fromPath = resolvePath(from);
    const toPath = resolvePath(to);
    if (fromPath === toPath)
        return '';
    // Use Node.js built-in relative function for proper cross-platform handling
    return (0, path_1.relative)(fromPath, toPath);
}
function createPathMatcher(patterns) {
    const patternArray = Array.isArray(patterns) ? patterns : [patterns];
    if (patternArray.length === 0) {
        return () => false;
    }
    const regexPatterns = patternArray.map(pattern => {
        // Split pattern by ** to handle it specially
        const parts = pattern.split('**');
        if (parts.length === 1) {
            // No ** in pattern, handle normally
            let escaped = pattern
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '[^/]*')
                .replace(/\?/g, '[^/]');
            return new RegExp(`^${escaped}$`);
        }
        // Has ** patterns, build regex differently
        const regexParts = parts.map(part => {
            // Escape each part and convert single * and ?
            return part
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '[^/]*')
                .replace(/\?/g, '[^/]');
        });
        // Join with pattern that matches zero or more path segments
        let joinedPattern = regexParts.join('(?:.*/)?');
        // Fix double slashes that can occur when joining
        joinedPattern = joinedPattern.replace(/\/\(\?\:\.\*\/\)\?\//g, '(?:.*/)?');
        return new RegExp(`^${joinedPattern}$`);
    });
    return (path) => {
        // Normalize path for pattern matching - always use forward slashes for patterns
        let normalizedPath = normalizePath(path);
        // Convert to forward slashes for pattern matching consistency
        normalizedPath = normalizedPath.replace(/\\/g, '/');
        return regexPatterns.some(regex => regex.test(normalizedPath));
    };
}
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const absBytes = Math.abs(bytes);
    const i = Math.floor(Math.log(absBytes) / Math.log(k));
    if (absBytes < k) {
        return `${bytes} B`;
    }
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(1)} ${sizes[i]}`;
}
function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    if (ms < 60000)
        return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000)
        return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
}
class PathCache {
    constructor(maxSizeOrTtl = 1000, maxSize) {
        this.cache = new Map();
        // Handle both old and new constructor signatures
        if (typeof maxSizeOrTtl === 'number' && maxSizeOrTtl < 100) {
            // Likely maxSize passed as first parameter (for backward compatibility)
            this.maxSize = maxSizeOrTtl;
            this.ttl = maxSize || 60000;
        }
        else {
            // TTL passed as first parameter (original signature)
            this.ttl = maxSizeOrTtl;
            this.maxSize = maxSize || 1000;
        }
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return undefined;
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return undefined;
        }
        return entry.result;
    }
    set(key, value) {
        // Implement LRU-style eviction if cache is full
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(key, { result: value, timestamp: Date.now() });
    }
    has(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return false;
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }
    delete(key) {
        return this.cache.delete(key);
    }
    clear() {
        this.cache.clear();
    }
    size() {
        return this.cache.size;
    }
}
exports.PathCache = PathCache;
exports.globalPathCache = new PathCache();
//# sourceMappingURL=utils.js.map