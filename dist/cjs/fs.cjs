"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileSystemOperations = void 0;
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const promises_2 = require("stream/promises");
const path_1 = require("path");
const errors_js_1 = require("./errors.js");
const utils_js_1 = require("./utils.js");
class FileSystemOperations {
    async copy(source, dest, options = {}) {
        const resolvedSource = (0, utils_js_1.resolvePath)(source);
        const resolvedDest = (0, utils_js_1.resolvePath)(dest);
        (0, utils_js_1.validatePath)(resolvedSource, 'copy');
        (0, utils_js_1.validatePath)(resolvedDest, 'copy');
        // Prevent copying to subdirectory of source
        if ((0, utils_js_1.isSubpath)(resolvedSource, resolvedDest)) {
            throw new errors_js_1.ShellError('Cannot copy a directory into itself', 'INVALID_OPERATION', 'copy', resolvedSource);
        }
        const operation = async () => {
            await this.copyImpl(resolvedSource, resolvedDest, options);
        };
        if (options.retry) {
            await (0, errors_js_1.withRetry)(operation, options.retry, 'copy');
        }
        else {
            await operation();
        }
    }
    async copyImpl(source, dest, options) {
        const sourceInfo = await (0, utils_js_1.getFileInfo)(source, options.followSymlinks ?? true);
        if (!sourceInfo.isFile && !sourceInfo.isDirectory && !sourceInfo.isSymlink) {
            throw new errors_js_1.ShellError(`Unsupported file type: ${source}`, 'INVALID_OPERATION', 'copy', source);
        }
        // Check if destination exists and handle noClobber option
        if (options.noClobber && await (0, utils_js_1.pathExists)(dest)) {
            return;
        }
        // Handle update option
        if (options.update && await (0, utils_js_1.pathExists)(dest)) {
            const destInfo = await (0, utils_js_1.getFileInfo)(dest);
            if (destInfo.mtime >= sourceInfo.mtime) {
                return;
            }
        }
        if (sourceInfo.isDirectory) {
            if (!options.recursive) {
                throw new errors_js_1.ShellError('Cannot copy directory without recursive option', 'EISDIR', 'copy', source);
            }
            await this.copyDirectory(source, dest, options);
        }
        else if (sourceInfo.isSymlink && !options.followSymlinks) {
            await this.copySymlink(source, dest);
        }
        else {
            await this.copyFileWithProgress(source, dest, sourceInfo.size, options);
        }
        // Preserve timestamps and permissions if requested
        if (options.preserve) {
            try {
                await (0, promises_1.utimes)(dest, sourceInfo.atime, sourceInfo.mtime);
                await (0, promises_1.chmod)(dest, sourceInfo.mode);
            }
            catch (error) {
                // Non-fatal errors in preservation
            }
        }
    }
    async copyDirectory(source, dest, options) {
        // Create destination directory
        try {
            await (0, promises_1.mkdir)(dest, { recursive: true });
        }
        catch (error) {
            if (error.code !== 'EEXIST') {
                throw errors_js_1.ShellError.fromNodeError(error, 'mkdir', dest);
            }
        }
        const entries = await (0, promises_1.readdir)(source, { withFileTypes: true });
        for (const entry of entries) {
            const sourcePath = (0, path_1.join)(source, entry.name);
            const destPath = (0, path_1.join)(dest, entry.name);
            if (entry.isDirectory()) {
                await this.copyDirectory(sourcePath, destPath, options);
            }
            else if (entry.isSymbolicLink() && !options.followSymlinks) {
                await this.copySymlink(sourcePath, destPath);
            }
            else {
                const fileInfo = await (0, utils_js_1.getFileInfo)(sourcePath, options.followSymlinks ?? true);
                await this.copyFileWithProgress(sourcePath, destPath, fileInfo.size, options);
            }
        }
    }
    async copySymlink(source, dest) {
        try {
            const linkTarget = await (0, promises_1.readlink)(source);
            await (0, promises_1.symlink)(linkTarget, dest);
        }
        catch (error) {
            throw errors_js_1.ShellError.fromNodeError(error, 'symlink', dest);
        }
    }
    async copyFileWithProgress(source, dest, totalSize, options) {
        // For small files, use the fast copyFile API
        if (totalSize < 1024 * 1024 || !options.onProgress) {
            try {
                await (0, promises_1.copyFile)(source, dest);
                if (options.onProgress) {
                    options.onProgress(totalSize, totalSize);
                }
                return;
            }
            catch (error) {
                throw errors_js_1.ShellError.fromNodeError(error, 'copyFile', source);
            }
        }
        // For large files or when progress is needed, use streams
        let bytesTransferred = 0;
        const sourceStream = (0, fs_1.createReadStream)(source);
        const destStream = (0, fs_1.createWriteStream)(dest);
        sourceStream.on('data', (chunk) => {
            const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            bytesTransferred += bufferChunk.length;
            if (options.onProgress) {
                options.onProgress(bytesTransferred, totalSize);
            }
        });
        try {
            await (0, promises_2.pipeline)(sourceStream, destStream);
        }
        catch (error) {
            throw errors_js_1.ShellError.fromNodeError(error, 'copy', source);
        }
    }
    async move(source, dest, options = {}) {
        const resolvedSource = (0, utils_js_1.resolvePath)(source);
        const resolvedDest = (0, utils_js_1.resolvePath)(dest);
        (0, utils_js_1.validatePath)(resolvedSource, 'move');
        (0, utils_js_1.validatePath)(resolvedDest, 'move');
        if (resolvedSource === resolvedDest) {
            return; // No-op
        }
        // Check if destination exists and handle noClobber option
        if (options.noClobber && await (0, utils_js_1.pathExists)(resolvedDest)) {
            return;
        }
        const operation = async () => {
            await this.moveImpl(resolvedSource, resolvedDest, options);
        };
        if (options.retry) {
            await (0, errors_js_1.withRetry)(operation, options.retry, 'move');
        }
        else {
            await operation();
        }
    }
    async moveImpl(source, dest, options) {
        try {
            // Try atomic rename first (fastest option)
            await (0, promises_1.rename)(source, dest);
            if (options.onProgress) {
                const sourceInfo = await (0, utils_js_1.getFileInfo)(dest); // source is now dest
                options.onProgress(sourceInfo.size, sourceInfo.size);
            }
        }
        catch (error) {
            const nodeError = error;
            // If rename fails due to cross-device move, fall back to copy + delete
            if (nodeError.code === 'EXDEV') {
                await this.copy(source, dest, {
                    recursive: true,
                    preserve: true,
                    ...(options.onProgress && { onProgress: options.onProgress })
                });
                await this.remove(source, { recursive: true, force: true });
            }
            else {
                throw errors_js_1.ShellError.fromNodeError(nodeError, 'move', source);
            }
        }
    }
    async remove(path, options = {}) {
        const resolvedPath = (0, utils_js_1.resolvePath)(path);
        (0, utils_js_1.validatePath)(resolvedPath, 'remove');
        if (!await (0, utils_js_1.pathExists)(resolvedPath)) {
            if (!options.force) {
                throw new errors_js_1.ShellError(`Path does not exist: ${resolvedPath}`, 'ENOENT', 'remove', resolvedPath);
            }
            return;
        }
        const operation = async () => {
            await this.removeImpl(resolvedPath, options);
        };
        if (options.retry) {
            await (0, errors_js_1.withRetry)(operation, options.retry, 'remove');
        }
        else {
            await operation();
        }
    }
    async removeImpl(path, options) {
        const fileInfo = await (0, utils_js_1.getFileInfo)(path, false);
        if (fileInfo.isDirectory) {
            if (!options.recursive) {
                throw new errors_js_1.ShellError('Cannot remove directory without recursive option', 'EISDIR', 'remove', path);
            }
            await this.removeDirectory(path, options);
        }
        else {
            await this.removeFile(path, options);
        }
    }
    async removeDirectory(path, options) {
        const entries = await (0, promises_1.readdir)(path, { withFileTypes: true });
        for (const entry of entries) {
            const entryPath = (0, path_1.join)(path, entry.name);
            if (entry.isDirectory()) {
                await this.removeDirectory(entryPath, options);
            }
            else {
                await this.removeFile(entryPath, options);
            }
            if (options.onProgress) {
                options.onProgress(1, entries.length);
            }
        }
        try {
            await (0, promises_1.rmdir)(path);
        }
        catch (error) {
            if (!options.force) {
                throw errors_js_1.ShellError.fromNodeError(error, 'rmdir', path);
            }
        }
    }
    async removeFile(path, options) {
        try {
            await (0, promises_1.unlink)(path);
            if (options.onProgress) {
                options.onProgress(1, 1);
            }
        }
        catch (error) {
            if (!options.force) {
                throw errors_js_1.ShellError.fromNodeError(error, 'unlink', path);
            }
        }
    }
    async mkdir(path, options = {}) {
        const resolvedPath = (0, utils_js_1.resolvePath)(path);
        (0, utils_js_1.validatePath)(resolvedPath, 'mkdir');
        const operation = async () => {
            try {
                await (0, promises_1.mkdir)(resolvedPath, {
                    recursive: options.recursive ?? false,
                    mode: options.mode
                });
            }
            catch (error) {
                const nodeError = error;
                if (nodeError.code !== 'EEXIST') {
                    throw errors_js_1.ShellError.fromNodeError(nodeError, 'mkdir', resolvedPath);
                }
            }
        };
        if (options.retry) {
            await (0, errors_js_1.withRetry)(operation, options.retry, 'mkdir');
        }
        else {
            await operation();
        }
    }
    async touch(path, options = {}) {
        const resolvedPath = (0, utils_js_1.resolvePath)(path);
        (0, utils_js_1.validatePath)(resolvedPath, 'touch');
        const operation = async () => {
            const now = new Date();
            const atime = options.atime ?? now;
            const mtime = options.mtime ?? now;
            try {
                // If file doesn't exist, create it
                if (!await (0, utils_js_1.pathExists)(resolvedPath)) {
                    // Ensure parent directory exists
                    const parentDir = (0, utils_js_1.getParentDir)(resolvedPath);
                    if (parentDir !== resolvedPath) {
                        await (0, promises_1.mkdir)(parentDir, { recursive: true });
                    }
                    await (0, promises_1.writeFile)(resolvedPath, '');
                    if (options.mode !== undefined) {
                        await (0, promises_1.chmod)(resolvedPath, options.mode);
                    }
                }
                // Update timestamps
                await (0, promises_1.utimes)(resolvedPath, atime, mtime);
            }
            catch (error) {
                throw errors_js_1.ShellError.fromNodeError(error, 'touch', resolvedPath);
            }
        };
        if (options.retry) {
            await (0, errors_js_1.withRetry)(operation, options.retry, 'touch');
        }
        else {
            await operation();
        }
    }
}
exports.FileSystemOperations = FileSystemOperations;
//# sourceMappingURL=fs.js.map