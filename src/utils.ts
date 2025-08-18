import { stat, lstat, access, constants } from 'fs/promises';
import { join, resolve, normalize, isAbsolute, sep, parse, format, relative } from 'path';
import { platform, homedir } from 'os';
import type { FileInfo } from './types.js';
import { ShellError } from './errors.js';

export function isWindows(): boolean {
  return platform() === 'win32';
}

export function isUnix(): boolean {
  return !isWindows();
}

export function normalizePath(path: string): string {
  if (!path) {
    throw ShellError.invalidPath(path, 'normalize');
  }
  
  // Handle home directory expansion
  if (path.startsWith('~/')) {
    path = join(homedir(), path.slice(2));
  }
  
  return normalize(path);
}

export function resolvePath(path: string, basePath?: string): string {
  const normalizedPath = normalizePath(path);
  
  if (isAbsolute(normalizedPath)) {
    return normalizedPath;
  }
  
  return resolve(basePath ?? process.cwd(), normalizedPath);
}

export function validatePath(path: string, operation: string): void {
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
    throw new ShellError(
      `Path too long: ${path.length} characters (max: ${maxPathLength})`,
      'ENAMETOOLONG',
      operation,
      path
    );
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isReadable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isWritable(path: string): Promise<boolean> {
  try {
    await access(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function getFileInfo(path: string, followSymlinks = true): Promise<FileInfo> {
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
  } catch (error) {
    throw ShellError.fromNodeError(error as NodeJS.ErrnoException, 'stat', resolvedPath);
  }
}

export function parsePath(path: string): { dir: string; name: string; base: string; ext: string; root: string } {
  return parse(normalizePath(path));
}

export function joinPaths(...paths: string[]): string {
  if (paths.length === 0) return '';
  return normalize(join(...paths));
}

export function getParentDir(path: string): string {
  if (!path || path.trim() === '') {
    return '.';
  }
  const parsed = parsePath(path);
  return parsed.dir || '.';
}

export function getBasename(path: string, ext?: string): string {
  const parsed = parsePath(path);
  return ext ? parsed.name : parsed.base;
}

export function getExtension(path: string): string {
  return parsePath(path).ext;
}

export function changeExtension(path: string, newExt: string): string {
  const parsed = parsePath(path);
  return format({
    ...parsed,
    base: undefined,
    ext: newExt.startsWith('.') ? newExt : `.${newExt}`
  });
}

export function ensureTrailingSeparator(path: string): string {
  return path.endsWith(sep) ? path : path + sep;
}

export function removeTrailingSeparator(path: string): string {
  if (path === sep) return '';
  return path.endsWith(sep) && path.length > 1 ? path.slice(0, -1) : path;
}

export function isSubpath(parent: string, child: string): boolean {
  const normalizedParent = resolvePath(parent);
  const normalizedChild = resolvePath(child);
  
  return normalizedChild.startsWith(ensureTrailingSeparator(normalizedParent));
}

export function getRelativePath(from: string, to: string): string {
  const fromPath = resolvePath(from);
  const toPath = resolvePath(to);
  
  if (fromPath === toPath) return '';
  
  // Use Node.js built-in relative function for proper cross-platform handling
  return relative(fromPath, toPath);
}

export function createPathMatcher(patterns: string | readonly string[]): (path: string) => boolean {
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
  
  return (path: string): boolean => {
    // Normalize path for pattern matching - always use forward slashes for patterns
    let normalizedPath = normalizePath(path);
    // Convert to forward slashes for pattern matching consistency
    normalizedPath = normalizedPath.replace(/\\/g, '/');
    return regexPatterns.some(regex => regex.test(normalizedPath));
  };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const absBytes = Math.abs(bytes);
  const i = Math.floor(Math.log(absBytes) / Math.log(k));
  
  if (absBytes < k) {
    return `${bytes} B`;
  }
  
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(1)} ${sizes[i]!}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

export class PathCache {
  private readonly cache = new Map<string, { result: unknown; timestamp: number }>();
  private readonly ttl: number;
  private readonly maxSize: number;

  constructor(maxSizeOrTtl = 1000, maxSize?: number) {
    // Handle both old and new constructor signatures
    if (typeof maxSizeOrTtl === 'number' && maxSizeOrTtl < 100) {
      // Likely maxSize passed as first parameter (for backward compatibility)
      this.maxSize = maxSizeOrTtl;
      this.ttl = maxSize || 60000;
    } else {
      // TTL passed as first parameter (original signature)
      this.ttl = maxSizeOrTtl;
      this.maxSize = maxSize || 1000;
    }
  }

  public get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.result as T;
  }

  public set<T>(key: string, value: T): void {
    // Implement LRU-style eviction if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, { result: value, timestamp: Date.now() });
  }

  public has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  public delete(key: string): boolean {
    return this.cache.delete(key);
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}

export const globalPathCache = new PathCache();