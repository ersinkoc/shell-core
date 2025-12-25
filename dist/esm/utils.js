import { stat, lstat, access, constants } from 'fs/promises';
import { join, resolve, normalize, isAbsolute, sep, parse, format, relative } from 'path';
import { platform, homedir } from 'os';
import { ShellError } from './errors.js';
export function isWindows() {
    return platform() === 'win32';
}
export function isUnix() {
    return !isWindows();
}
export function normalizePath(path) {
    if (!path) {
        throw ShellError.invalidPath(path, 'normalize');
    }
    // Handle home directory expansion
    if (path.startsWith('~/')) {
        path = join(homedir(), path.slice(2));
    }
    // BUG-001 FIX: Normalize and convert all backslashes to forward slashes for cross-platform consistency
    // Also collapse multiple forward slashes into single slash
    return normalize(path).replace(/\\/g, '/').replace(/\/+/g, '/');
}
export function resolvePath(path, basePath) {
    const normalizedPath = normalizePath(path);
    if (isAbsolute(normalizedPath)) {
        return normalizedPath;
    }
    return resolve(basePath ?? process.cwd(), normalizedPath);
}
export function validatePath(path, operation) {
    if (!path || typeof path !== 'string' || path.trim() === '') {
        throw new ShellError(`Invalid path for ${operation}`, 'EINVAL', operation, path);
    }
    // Check for null bytes and control characters
    if (/[\0\x01-\x1f]/.test(path)) {
        throw new ShellError(`Invalid characters in path for ${operation}`, 'EINVAL', operation, path);
    }
    // Check for Windows-specific invalid characters
    if (isWindows()) {
        if (/[<>"|?*]/.test(path)) {
            throw new ShellError(`Invalid characters in path for ${operation}`, 'EINVAL', operation, path);
        }
        // Check for reserved names
        const basename = path.split(/[/\\]/).pop()?.toUpperCase() || '';
        const reserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
        if (reserved.some(name => basename === name || basename.startsWith(name + '.'))) {
            throw new ShellError(`Reserved name in path for ${operation}`, 'EINVAL', operation, path);
        }
    }
    // Check path length limits
    const maxPathLength = isWindows() ? 260 : 4096;
    if (path.length > maxPathLength) {
        throw new ShellError(`Path too long: ${path.length} characters (max: ${maxPathLength})`, 'ENAMETOOLONG', operation, path);
    }
}
export async function pathExists(path) {
    try {
        await access(path, constants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
export async function isReadable(path) {
    try {
        await access(path, constants.R_OK);
        return true;
    }
    catch {
        return false;
    }
}
export async function isWritable(path) {
    try {
        await access(path, constants.W_OK);
        return true;
    }
    catch {
        return false;
    }
}
export async function isExecutable(path) {
    try {
        await access(path, constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
export async function getFileInfo(path, followSymlinks = true) {
    const resolvedPath = resolvePath(path);
    try {
        const stats = followSymlinks ? await stat(resolvedPath) : await lstat(resolvedPath);
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
        throw ShellError.fromNodeError(error, 'stat', resolvedPath);
    }
}
export function parsePath(path) {
    return parse(normalizePath(path));
}
export function joinPaths(...paths) {
    if (paths.length === 0)
        return '';
    return normalize(join(...paths));
}
export function getParentDir(path) {
    if (!path || path.trim() === '') {
        return '.';
    }
    const parsed = parsePath(path);
    return parsed.dir || '.';
}
export function getBasename(path, ext) {
    const parsed = parsePath(path);
    return ext ? parsed.name : parsed.base;
}
export function getExtension(path) {
    return parsePath(path).ext;
}
export function changeExtension(path, newExt) {
    const parsed = parsePath(path);
    return format({
        ...parsed,
        base: undefined,
        ext: newExt.startsWith('.') ? newExt : `.${newExt}`
    });
}
export function ensureTrailingSeparator(path) {
    return path.endsWith(sep) ? path : path + sep;
}
export function removeTrailingSeparator(path) {
    // BUG-002 NOTE: Original behavior returns empty string for root path
    // This is intentional for consistency with path operations that expect empty/non-root paths
    if (path === sep)
        return '';
    return path.endsWith(sep) && path.length > 1 ? path.slice(0, -1) : path;
}
export function isSubpath(parent, child) {
    const normalizedParent = resolvePath(parent);
    const normalizedChild = resolvePath(child);
    return normalizedChild.startsWith(ensureTrailingSeparator(normalizedParent));
}
export function getRelativePath(from, to) {
    const fromPath = resolvePath(from);
    const toPath = resolvePath(to);
    if (fromPath === toPath)
        return '';
    // Use Node.js built-in relative function for proper cross-platform handling
    return relative(fromPath, toPath);
}
export function createPathMatcher(patterns) {
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
export function formatBytes(bytes) {
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
export function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    if (ms < 60000)
        return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000)
        return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
}
export class PathCache {
    cache = new Map();
    ttl;
    maxSize;
    constructor(ttlOrMaxSize = 60000, maxSize) {
        // BUG-003 FIX: Maintain backward compatibility while improving clarity
        // If only one argument provided and it's small (< 100), treat as maxSize for backward compatibility
        // Otherwise treat as TTL with optional maxSize second parameter
        if (maxSize === undefined && ttlOrMaxSize < 100) {
            // Backward compatibility: single small number is maxSize
            this.maxSize = ttlOrMaxSize;
            this.ttl = 60000; // Default TTL
        }
        else if (maxSize !== undefined) {
            // New style: (ttl, maxSize)
            this.ttl = ttlOrMaxSize;
            this.maxSize = maxSize;
        }
        else {
            // Single large number is TTL
            this.ttl = ttlOrMaxSize;
            this.maxSize = 1000; // Default maxSize
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
export const globalPathCache = new PathCache();
//# sourceMappingURL=utils.js.map