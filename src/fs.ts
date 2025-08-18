import { 
  copyFile, 
  mkdir as fsMkdir, 
  readdir, 
  unlink, 
  rmdir, 
  rename, 
  utimes, 
  chmod,
  writeFile,
  symlink,
  readlink
} from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { join } from 'path';
import type { 
  CopyOptions, 
  MoveOptions, 
  RemoveOptions, 
  MkdirOptions, 
  TouchOptions
} from './types.js';
import { ShellError, withRetry } from './errors.js';
import { 
  resolvePath, 
  validatePath, 
  pathExists, 
  getFileInfo, 
  isSubpath,
  getParentDir 
} from './utils.js';

export class FileSystemOperations {
  public async copy(source: string, dest: string, options: CopyOptions = {}): Promise<void> {
    const resolvedSource = resolvePath(source);
    const resolvedDest = resolvePath(dest);
    
    validatePath(resolvedSource, 'copy');
    validatePath(resolvedDest, 'copy');
    
    // Prevent copying to subdirectory of source
    if (isSubpath(resolvedSource, resolvedDest)) {
      throw new ShellError(
        'Cannot copy a directory into itself',
        'INVALID_OPERATION',
        'copy',
        resolvedSource
      );
    }
    
    const operation = async (): Promise<void> => {
      await this.copyImpl(resolvedSource, resolvedDest, options);
    };
    
    if (options.retry) {
      await withRetry(operation, options.retry, 'copy');
    } else {
      await operation();
    }
  }

  private async copyImpl(source: string, dest: string, options: CopyOptions): Promise<void> {
    const sourceInfo = await getFileInfo(source, options.followSymlinks ?? true);
    
    if (!sourceInfo.isFile && !sourceInfo.isDirectory && !sourceInfo.isSymlink) {
      throw new ShellError(
        `Unsupported file type: ${source}`,
        'INVALID_OPERATION',
        'copy',
        source
      );
    }
    
    // Check if destination exists and handle noClobber option
    if (options.noClobber && await pathExists(dest)) {
      return;
    }
    
    // Handle update option
    if (options.update && await pathExists(dest)) {
      const destInfo = await getFileInfo(dest);
      if (destInfo.mtime >= sourceInfo.mtime) {
        return;
      }
    }
    
    if (sourceInfo.isDirectory) {
      if (!options.recursive) {
        throw new ShellError(
          'Cannot copy directory without recursive option',
          'EISDIR',
          'copy',
          source
        );
      }
      await this.copyDirectory(source, dest, options);
    } else if (sourceInfo.isSymlink && !options.followSymlinks) {
      await this.copySymlink(source, dest);
    } else {
      await this.copyFileWithProgress(source, dest, sourceInfo.size, options);
    }
    
    // Preserve timestamps and permissions if requested
    if (options.preserve) {
      try {
        await utimes(dest, sourceInfo.atime, sourceInfo.mtime);
        await chmod(dest, sourceInfo.mode);
      } catch (error) {
        // Non-fatal errors in preservation
      }
    }
  }

  private async copyDirectory(source: string, dest: string, options: CopyOptions): Promise<void> {
    // Create destination directory
    try {
      await fsMkdir(dest, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw ShellError.fromNodeError(error as NodeJS.ErrnoException, 'mkdir', dest);
      }
    }
    
    const entries = await readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourcePath = join(source, entry.name);
      const destPath = join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath, options);
      } else if (entry.isSymbolicLink() && !options.followSymlinks) {
        await this.copySymlink(sourcePath, destPath);
      } else {
        const fileInfo = await getFileInfo(sourcePath, options.followSymlinks ?? true);
        await this.copyFileWithProgress(sourcePath, destPath, fileInfo.size, options);
      }
    }
  }

  private async copySymlink(source: string, dest: string): Promise<void> {
    try {
      const linkTarget = await readlink(source);
      await symlink(linkTarget, dest);
    } catch (error) {
      throw ShellError.fromNodeError(error as NodeJS.ErrnoException, 'symlink', dest);
    }
  }

  private async copyFileWithProgress(
    source: string, 
    dest: string, 
    totalSize: number, 
    options: CopyOptions
  ): Promise<void> {
    // For small files, use the fast copyFile API
    if (totalSize < 1024 * 1024 || !options.onProgress) {
      try {
        await copyFile(source, dest);
        if (options.onProgress) {
          options.onProgress(totalSize, totalSize);
        }
        return;
      } catch (error) {
        throw ShellError.fromNodeError(error as NodeJS.ErrnoException, 'copyFile', source);
      }
    }
    
    // For large files or when progress is needed, use streams
    let bytesTransferred = 0;
    
    const sourceStream = createReadStream(source);
    const destStream = createWriteStream(dest);
    
    sourceStream.on('data', (chunk: Buffer | string) => {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytesTransferred += bufferChunk.length;
      if (options.onProgress) {
        options.onProgress(bytesTransferred, totalSize);
      }
    });
    
    try {
      await pipeline(sourceStream, destStream);
    } catch (error) {
      throw ShellError.fromNodeError(error as NodeJS.ErrnoException, 'copy', source);
    }
  }

  public async move(source: string, dest: string, options: MoveOptions = {}): Promise<void> {
    const resolvedSource = resolvePath(source);
    const resolvedDest = resolvePath(dest);
    
    validatePath(resolvedSource, 'move');
    validatePath(resolvedDest, 'move');
    
    if (resolvedSource === resolvedDest) {
      return; // No-op
    }
    
    // Check if destination exists and handle noClobber option
    if (options.noClobber && await pathExists(resolvedDest)) {
      return;
    }
    
    const operation = async (): Promise<void> => {
      await this.moveImpl(resolvedSource, resolvedDest, options);
    };
    
    if (options.retry) {
      await withRetry(operation, options.retry, 'move');
    } else {
      await operation();
    }
  }

  private async moveImpl(source: string, dest: string, options: MoveOptions): Promise<void> {
    try {
      // Try atomic rename first (fastest option)
      await rename(source, dest);
      if (options.onProgress) {
        const sourceInfo = await getFileInfo(dest); // source is now dest
        options.onProgress(sourceInfo.size, sourceInfo.size);
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      
      // If rename fails due to cross-device move, fall back to copy + delete
      if (nodeError.code === 'EXDEV') {
        await this.copy(source, dest, { 
          recursive: true, 
          preserve: true,
          ...(options.onProgress && { onProgress: options.onProgress })
        });
        await this.remove(source, { recursive: true, force: true });
      } else {
        throw ShellError.fromNodeError(nodeError, 'move', source);
      }
    }
  }

  public async remove(path: string, options: RemoveOptions = {}): Promise<void> {
    const resolvedPath = resolvePath(path);
    validatePath(resolvedPath, 'remove');
    
    if (!await pathExists(resolvedPath)) {
      if (!options.force) {
        throw new ShellError(
          `Path does not exist: ${resolvedPath}`,
          'ENOENT',
          'remove',
          resolvedPath
        );
      }
      return;
    }
    
    const operation = async (): Promise<void> => {
      await this.removeImpl(resolvedPath, options);
    };
    
    if (options.retry) {
      await withRetry(operation, options.retry, 'remove');
    } else {
      await operation();
    }
  }

  private async removeImpl(path: string, options: RemoveOptions): Promise<void> {
    const fileInfo = await getFileInfo(path, false);
    
    if (fileInfo.isDirectory) {
      if (!options.recursive) {
        throw new ShellError(
          'Cannot remove directory without recursive option',
          'EISDIR',
          'remove',
          path
        );
      }
      
      await this.removeDirectory(path, options);
    } else {
      await this.removeFile(path, options);
    }
  }

  private async removeDirectory(path: string, options: RemoveOptions): Promise<void> {
    const entries = await readdir(path, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = join(path, entry.name);
      
      if (entry.isDirectory()) {
        await this.removeDirectory(entryPath, options);
      } else {
        await this.removeFile(entryPath, options);
      }
      
      if (options.onProgress) {
        options.onProgress(1, entries.length);
      }
    }
    
    try {
      await rmdir(path);
    } catch (error) {
      if (!options.force) {
        throw ShellError.fromNodeError(error as NodeJS.ErrnoException, 'rmdir', path);
      }
    }
  }

  private async removeFile(path: string, options: RemoveOptions): Promise<void> {
    try {
      await unlink(path);
      if (options.onProgress) {
        options.onProgress(1, 1);
      }
    } catch (error) {
      if (!options.force) {
        throw ShellError.fromNodeError(error as NodeJS.ErrnoException, 'unlink', path);
      }
    }
  }

  public async mkdir(path: string, options: MkdirOptions = {}): Promise<void> {
    const resolvedPath = resolvePath(path);
    validatePath(resolvedPath, 'mkdir');
    
    const operation = async (): Promise<void> => {
      try {
        await fsMkdir(resolvedPath, {
          recursive: options.recursive ?? false,
          mode: options.mode
        });
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code !== 'EEXIST') {
          throw ShellError.fromNodeError(nodeError, 'mkdir', resolvedPath);
        }
      }
    };
    
    if (options.retry) {
      await withRetry(operation, options.retry, 'mkdir');
    } else {
      await operation();
    }
  }

  public async touch(path: string, options: TouchOptions = {}): Promise<void> {
    const resolvedPath = resolvePath(path);
    validatePath(resolvedPath, 'touch');
    
    const operation = async (): Promise<void> => {
      const now = new Date();
      const atime = options.atime ?? now;
      const mtime = options.mtime ?? now;
      
      try {
        // If file doesn't exist, create it
        if (!await pathExists(resolvedPath)) {
          // Ensure parent directory exists
          const parentDir = getParentDir(resolvedPath);
          if (parentDir !== resolvedPath) {
            await fsMkdir(parentDir, { recursive: true });
          }
          
          await writeFile(resolvedPath, '');
          
          if (options.mode !== undefined) {
            await chmod(resolvedPath, options.mode);
          }
        }
        
        // Update timestamps
        await utimes(resolvedPath, atime, mtime);
      } catch (error) {
        throw ShellError.fromNodeError(error as NodeJS.ErrnoException, 'touch', resolvedPath);
      }
    };
    
    if (options.retry) {
      await withRetry(operation, options.retry, 'touch');
    } else {
      await operation();
    }
  }
}