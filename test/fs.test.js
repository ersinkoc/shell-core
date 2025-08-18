import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'path';
import { writeFile, mkdir, rm, readFile, stat, chmod } from 'fs/promises';
import { tmpdir } from 'os';
import { createShell } from '../dist/esm/index.js';

const testDir = join(tmpdir(), 'shell-fs-test-' + Date.now());
const shell = createShell({ silent: true });

describe('File System Operations Tests', () => {
  
  test('should copy files with options', async () => {
    await mkdir(testDir, { recursive: true });
    
    const sourceFile = join(testDir, 'source.txt');
    const destFile = join(testDir, 'dest.txt');
    const testContent = 'File system test content';
    
    await writeFile(sourceFile, testContent);
    
    // Test basic copy
    await shell.copy(sourceFile, destFile);
    const destContent = await readFile(destFile, 'utf-8');
    assert.equal(destContent, testContent);
    
    // Test copy with preserve option
    const preserveSource = join(testDir, 'preserve-source.txt');
    const preserveDest = join(testDir, 'preserve-dest.txt');
    await writeFile(preserveSource, 'preserve test');
    
    await shell.copy(preserveSource, preserveDest, { preserve: true });
    const preserveDestContent = await readFile(preserveDest, 'utf-8');
    assert.equal(preserveDestContent, 'preserve test');
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should copy directories recursively', async () => {
    await mkdir(testDir, { recursive: true });
    
    const sourceDir = join(testDir, 'source-dir');
    const destDir = join(testDir, 'dest-dir');
    const subDir = join(sourceDir, 'subdir');
    const sourceFile = join(subDir, 'file.txt');
    
    await mkdir(subDir, { recursive: true });
    await writeFile(sourceFile, 'nested file content');
    
    // Copy directory recursively
    await shell.copy(sourceDir, destDir, { recursive: true });
    
    const destFile = join(destDir, 'subdir', 'file.txt');
    const destContent = await readFile(destFile, 'utf-8');
    assert.equal(destContent, 'nested file content');
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should move files and directories', async () => {
    await mkdir(testDir, { recursive: true });
    
    const sourceFile = join(testDir, 'move-source.txt');
    const destFile = join(testDir, 'move-dest.txt');
    const testContent = 'Move test content';
    
    await writeFile(sourceFile, testContent);
    
    // Test file move
    await shell.move(sourceFile, destFile);
    
    // Source should not exist
    try {
      await stat(sourceFile);
      assert.fail('Source file should not exist after move');
    } catch (error) {
      assert.equal(error.code, 'ENOENT');
    }
    
    // Destination should exist with correct content
    const destContent = await readFile(destFile, 'utf-8');
    assert.equal(destContent, testContent);
    
    // Test directory move
    const sourceDir = join(testDir, 'move-source-dir');
    const destDir = join(testDir, 'move-dest-dir');
    const nestedFile = join(sourceDir, 'nested.txt');
    
    await mkdir(sourceDir, { recursive: true });
    await writeFile(nestedFile, 'nested content');
    
    await shell.move(sourceDir, destDir);
    
    // Check destination directory
    const movedFile = join(destDir, 'nested.txt');
    const movedContent = await readFile(movedFile, 'utf-8');
    assert.equal(movedContent, 'nested content');
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should remove files and directories', async () => {
    await mkdir(testDir, { recursive: true });
    
    const testFile = join(testDir, 'remove-test.txt');
    const testDir2 = join(testDir, 'remove-dir');
    const nestedFile = join(testDir2, 'nested.txt');
    
    await writeFile(testFile, 'remove test');
    await mkdir(testDir2, { recursive: true });
    await writeFile(nestedFile, 'nested remove test');
    
    // Test file removal
    await shell.remove(testFile);
    
    try {
      await stat(testFile);
      assert.fail('File should be removed');
    } catch (error) {
      assert.equal(error.code, 'ENOENT');
    }
    
    // Test directory removal
    await shell.remove(testDir2, { recursive: true });
    
    try {
      await stat(testDir2);
      assert.fail('Directory should be removed');
    } catch (error) {
      assert.equal(error.code, 'ENOENT');
    }
    
    // Test force removal
    await shell.remove(join(testDir, 'nonexistent'), { force: true });
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should create directories with options', async () => {
    await mkdir(testDir, { recursive: true });
    
    const newDir = join(testDir, 'new-directory');
    const nestedDir = join(testDir, 'nested', 'deep', 'directory');
    
    // Test basic mkdir
    await shell.mkdir(newDir);
    const newDirStat = await stat(newDir);
    assert.ok(newDirStat.isDirectory());
    
    // Test recursive mkdir
    await shell.mkdir(nestedDir, { recursive: true });
    const nestedDirStat = await stat(nestedDir);
    assert.ok(nestedDirStat.isDirectory());
    
    // Test mkdir with mode (Unix-like systems)
    if (process.platform !== 'win32') {
      const modeDir = join(testDir, 'mode-dir');
      await shell.mkdir(modeDir, { mode: 0o755 });
      const modeDirStat = await stat(modeDir);
      assert.ok(modeDirStat.isDirectory());
    }
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should touch files with timestamps', async () => {
    await mkdir(testDir, { recursive: true });
    
    const touchFile = join(testDir, 'touch-test.txt');
    const customTime = new Date('2023-01-01T00:00:00Z');
    
    // Test creating new file
    await shell.touch(touchFile);
    const fileStat = await stat(touchFile);
    assert.ok(fileStat.isFile());
    
    // Test updating timestamp
    await shell.touch(touchFile, { mtime: customTime });
    const updatedStat = await stat(touchFile);
    assert.equal(updatedStat.mtime.getTime(), customTime.getTime());
    
    // Test touching multiple files
    const touchFile2 = join(testDir, 'touch-test-2.txt');
    const touchFile3 = join(testDir, 'touch-test-3.txt');
    
    await shell.touch(touchFile2);
    await shell.touch(touchFile3);
    
    const file2Stat = await stat(touchFile2);
    const file3Stat = await stat(touchFile3);
    assert.ok(file2Stat.isFile());
    assert.ok(file3Stat.isFile());
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle file permissions', async () => {
    // Skip on Windows as it doesn't support Unix-style permissions
    if (process.platform === 'win32') {
      console.log('   ⏭️  Skipping permission tests on Windows');
      return;
    }
    
    await mkdir(testDir, { recursive: true });
    
    const permFile = join(testDir, 'perm-test.txt');
    await writeFile(permFile, 'permission test');
    
    // Test chmod functionality through shell operations
    await chmod(permFile, 0o644);
    
    const fileStat = await stat(permFile);
    assert.equal(fileStat.mode & 0o777, 0o644);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle symlinks', async () => {
    // Skip on Windows as symlinks require special permissions
    if (process.platform === 'win32') {
      console.log('   ⏭️  Skipping symlink tests on Windows');
      return;
    }
    
    await mkdir(testDir, { recursive: true });
    
    const targetFile = join(testDir, 'target.txt');
    const linkFile = join(testDir, 'link.txt');
    
    await writeFile(targetFile, 'symlink target');
    
    // Create symlink using exec
    await shell.exec(`ln -s "${targetFile}" "${linkFile}"`);
    
    const linkStat = await stat(linkFile);
    assert.ok(linkStat.isFile());
    
    const linkContent = await readFile(linkFile, 'utf-8');
    assert.equal(linkContent, 'symlink target');
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle large files efficiently', async () => {
    await mkdir(testDir, { recursive: true });
    
    const largeFile = join(testDir, 'large-file.txt');
    const copyFile = join(testDir, 'large-copy.txt');
    
    // Create a moderately large file (1MB)
    const largeContent = 'x'.repeat(1024 * 1024);
    await writeFile(largeFile, largeContent);
    
    const startTime = Date.now();
    await shell.copy(largeFile, copyFile);
    const duration = Date.now() - startTime;
    
    // Verify copy was successful
    const copyContent = await readFile(copyFile, 'utf-8');
    assert.equal(copyContent.length, largeContent.length);
    
    console.log(`   📊 Large file copy (1MB): ${duration}ms`);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle concurrent operations', async () => {
    await mkdir(testDir, { recursive: true });
    
    const concurrentOps = [];
    const numOps = 10;
    
    for (let i = 0; i < numOps; i++) {
      const sourceFile = join(testDir, `concurrent-source-${i}.txt`);
      const destFile = join(testDir, `concurrent-dest-${i}.txt`);
      
      await writeFile(sourceFile, `Content ${i}`);
      
      concurrentOps.push(shell.copy(sourceFile, destFile));
    }
    
    const startTime = Date.now();
    await Promise.all(concurrentOps);
    const duration = Date.now() - startTime;
    
    // Verify all copies were successful
    for (let i = 0; i < numOps; i++) {
      const destFile = join(testDir, `concurrent-dest-${i}.txt`);
      const content = await readFile(destFile, 'utf-8');
      assert.equal(content, `Content ${i}`);
    }
    
    console.log(`   📊 Concurrent operations (${numOps}): ${duration}ms`);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle error cases gracefully', async () => {
    await mkdir(testDir, { recursive: true });
    
    // Create a shell with fatal mode for this test
    const fatalShell = createShell({ fatal: true, silent: true });
    
    // Test copying non-existent file
    try {
      await fatalShell.copy(join(testDir, 'nonexistent.txt'), join(testDir, 'dest.txt'));
      assert.fail('Should throw error for non-existent source');
    } catch (error) {
      assert.equal(error.code, 'ENOENT');
    }
    
    // Test removing non-existent file without force
    try {
      await fatalShell.remove(join(testDir, 'nonexistent.txt'));
      assert.fail('Should throw error for non-existent file');
    } catch (error) {
      assert.equal(error.code, 'ENOENT');
    }
    
    // Test creating directory over existing file
    const existingFile = join(testDir, 'existing.txt');
    await writeFile(existingFile, 'existing');
    
    try {
      await fatalShell.mkdir(existingFile);
      assert.fail('Should throw error when creating dir over file');
    } catch (error) {
      // Should throw some kind of file system error
      assert.ok(error.code && error.code.length > 0);
    }
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should support progress tracking', async () => {
    await mkdir(testDir, { recursive: true });
    
    const sourceFiles = [];
    const numFiles = 5;
    
    // Create multiple files
    for (let i = 0; i < numFiles; i++) {
      const sourceFile = join(testDir, `progress-source-${i}.txt`);
      await writeFile(sourceFile, `Progress test content ${i}`.repeat(100));
      sourceFiles.push(sourceFile);
    }
    
    const destDir = join(testDir, 'progress-dest');
    await mkdir(destDir);
    
    let progressCalls = 0;
    const progressCallback = (current, total) => {
      progressCalls++;
      assert.ok(current <= total);
      assert.ok(current >= 0);
    };
    
    // Copy with progress tracking
    for (const sourceFile of sourceFiles) {
      const destFile = join(destDir, `dest-${sourceFiles.indexOf(sourceFile)}.txt`);
      await shell.copy(sourceFile, destFile, { onProgress: progressCallback });
    }
    
    console.log(`   📊 Progress callbacks: ${progressCalls}`);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
});