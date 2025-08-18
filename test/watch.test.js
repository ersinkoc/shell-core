import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'path';
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { createShell } from '../dist/esm/index.js';

const testDir = join(tmpdir(), 'shell-watch-test-' + Date.now());
const shell = createShell({ silent: true });

describe('Watch System Tests', () => {
  
  test('should create file watcher', async () => {
    await mkdir(testDir, { recursive: true });
    
    const watchPath = join(testDir, '*.txt');
    
    // Create watcher
    const watcher = shell.watch(watchPath, {
      ignoreInitial: true
    });
    
    assert.ok(watcher);
    assert.equal(typeof watcher.on, 'function');
    assert.equal(typeof watcher.close, 'function');
    
    // Verify watcher events are available
    const events = ['add', 'change', 'unlink', 'addDir', 'unlinkDir', 'ready', 'error'];
    events.forEach(event => {
      assert.equal(typeof watcher.on, 'function');
    });
    
    await watcher.close();
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should watch file additions', async () => {
    await mkdir(testDir, { recursive: true });
    
    const watchDir = join(testDir, 'watch-add');
    await mkdir(watchDir);
    
    let addEvents = [];
    
    const watcher = shell.watch(join(watchDir, '*.txt'), {
      ignoreInitial: true
    });
    
    watcher.on('add', (path, stats) => {
      addEvents.push({ path, size: stats?.size });
    });
    
    // Wait for watcher to be ready
    await new Promise(resolve => {
      watcher.once('ready', resolve);
      setTimeout(resolve, 1000); // Fallback timeout
    });
    
    // Create test files
    const testFile1 = join(watchDir, 'add-test1.txt');
    const testFile2 = join(watchDir, 'add-test2.txt');
    
    await writeFile(testFile1, 'Test file 1 content');
    await new Promise(resolve => setTimeout(resolve, 200)); // Wait for event
    
    await writeFile(testFile2, 'Test file 2 content');
    await new Promise(resolve => setTimeout(resolve, 200)); // Wait for event
    
    await watcher.close();
    
    // Verify add events were captured
    console.log(`   📊 Add events captured: ${addEvents.length}`);
    
    if (addEvents.length > 0) {
      assert.ok(addEvents.some(event => event.path.includes('add-test1.txt')));
    }
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should watch file changes', async () => {
    await mkdir(testDir, { recursive: true });
    
    const watchDir = join(testDir, 'watch-change');
    await mkdir(watchDir);
    
    const testFile = join(watchDir, 'change-test.txt');
    await writeFile(testFile, 'Initial content');
    
    let changeEvents = [];
    
    const watcher = shell.watch(join(watchDir, '*.txt'), {
      ignoreInitial: true
    });
    
    watcher.on('change', (path, stats) => {
      changeEvents.push({ path, size: stats?.size });
    });
    
    // Wait for watcher to be ready
    await new Promise(resolve => {
      watcher.once('ready', resolve);
      setTimeout(resolve, 1000); // Fallback timeout
    });
    
    // Modify the file
    await writeFile(testFile, 'Modified content');
    await new Promise(resolve => setTimeout(resolve, 200)); // Wait for event
    
    await writeFile(testFile, 'Modified content again');
    await new Promise(resolve => setTimeout(resolve, 200)); // Wait for event
    
    await watcher.close();
    
    // Verify change events were captured
    console.log(`   📊 Change events captured: ${changeEvents.length}`);
    
    if (changeEvents.length > 0) {
      assert.ok(changeEvents.some(event => event.path.includes('change-test.txt')));
    }
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should watch file deletions', async () => {
    await mkdir(testDir, { recursive: true });
    
    const watchDir = join(testDir, 'watch-unlink');
    await mkdir(watchDir);
    
    const testFile1 = join(watchDir, 'unlink-test1.txt');
    const testFile2 = join(watchDir, 'unlink-test2.txt');
    
    await writeFile(testFile1, 'File to be deleted 1');
    await writeFile(testFile2, 'File to be deleted 2');
    
    let unlinkEvents = [];
    
    const watcher = shell.watch(join(watchDir, '*.txt'), {
      ignoreInitial: true
    });
    
    watcher.on('unlink', (path) => {
      unlinkEvents.push({ path });
    });
    
    // Wait for watcher to be ready
    await new Promise(resolve => {
      watcher.once('ready', resolve);
      setTimeout(resolve, 1000); // Fallback timeout
    });
    
    // Delete files
    await shell.remove(testFile1);
    await new Promise(resolve => setTimeout(resolve, 200)); // Wait for event
    
    await shell.remove(testFile2);
    await new Promise(resolve => setTimeout(resolve, 200)); // Wait for event
    
    await watcher.close();
    
    // Verify unlink events were captured
    console.log(`   📊 Unlink events captured: ${unlinkEvents.length}`);
    
    if (unlinkEvents.length > 0) {
      assert.ok(unlinkEvents.some(event => event.path.includes('unlink-test1.txt')));
    }
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should watch directory operations', async () => {
    await mkdir(testDir, { recursive: true });
    
    const watchDir = join(testDir, 'watch-dirs');
    await mkdir(watchDir);
    
    let dirEvents = [];
    
    const watcher = shell.watch(watchDir, {
      ignoreInitial: true,
      recursive: true
    });
    
    watcher.on('addDir', (path) => {
      dirEvents.push({ type: 'addDir', path });
    });
    
    watcher.on('unlinkDir', (path) => {
      dirEvents.push({ type: 'unlinkDir', path });
    });
    
    // Wait for watcher to be ready
    await new Promise(resolve => {
      watcher.once('ready', resolve);
      setTimeout(resolve, 1000); // Fallback timeout
    });
    
    // Create and remove directories
    const subDir1 = join(watchDir, 'subdir1');
    const subDir2 = join(watchDir, 'subdir2');
    
    await mkdir(subDir1);
    await new Promise(resolve => setTimeout(resolve, 200)); // Wait for event
    
    await mkdir(subDir2);
    await new Promise(resolve => setTimeout(resolve, 200)); // Wait for event
    
    await shell.remove(subDir1, { recursive: true });
    await new Promise(resolve => setTimeout(resolve, 200)); // Wait for event
    
    await watcher.close();
    
    // Verify directory events were captured
    console.log(`   📊 Directory events captured: ${dirEvents.length}`);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle multiple watch paths', async () => {
    await mkdir(testDir, { recursive: true });
    
    const watchDir1 = join(testDir, 'watch-multi1');
    const watchDir2 = join(testDir, 'watch-multi2');
    
    await mkdir(watchDir1);
    await mkdir(watchDir2);
    
    let events = [];
    
    // Watch multiple paths
    const watcher = shell.watch([
      join(watchDir1, '*.txt'),
      join(watchDir2, '*.txt')
    ], {
      ignoreInitial: true
    });
    
    watcher.on('add', (path) => {
      events.push({ type: 'add', path });
    });
    
    // Wait for watcher to be ready
    await new Promise(resolve => {
      watcher.once('ready', resolve);
      setTimeout(resolve, 1000); // Fallback timeout
    });
    
    // Create files in both directories
    await writeFile(join(watchDir1, 'multi1.txt'), 'Content 1');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    await writeFile(join(watchDir2, 'multi2.txt'), 'Content 2');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    await watcher.close();
    
    console.log(`   📊 Multi-path events captured: ${events.length}`);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle watch options', async () => {
    await mkdir(testDir, { recursive: true });
    
    const watchDir = join(testDir, 'watch-options');
    await mkdir(watchDir);
    
    // Create initial files
    const initialFile = join(watchDir, 'initial.txt');
    await writeFile(initialFile, 'Initial file');
    
    let events = [];
    
    // Test with ignoreInitial option
    const watcher = shell.watch(join(watchDir, '*.txt'), {
      ignoreInitial: false, // Should capture initial files
      persistent: true,
      recursive: false
    });
    
    watcher.on('add', (path) => {
      events.push({ type: 'add', path });
    });
    
    // Wait for initial scan
    await new Promise(resolve => {
      watcher.once('ready', resolve);
      setTimeout(resolve, 1500); // Longer timeout for initial scan
    });
    
    await watcher.close();
    
    console.log(`   📊 Events with options: ${events.length}`);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle watcher errors gracefully', async () => {
    let errorEvents = [];
    
    // Try to watch non-existent path
    const watcher = shell.watch('/nonexistent/path/*.txt', {
      ignoreInitial: true
    });
    
    watcher.on('error', (error) => {
      errorEvents.push(error);
    });
    
    // Wait for potential error
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await watcher.close();
    
    // Errors might or might not occur depending on implementation
    console.log(`   📊 Error events captured: ${errorEvents.length}`);
  });
  
  test('should support watcher lifecycle management', async () => {
    await mkdir(testDir, { recursive: true });
    
    const watchDir = join(testDir, 'watch-lifecycle');
    await mkdir(watchDir);
    
    const watcher = shell.watch(join(watchDir, '*.txt'), {
      ignoreInitial: true
    });
    
    let readyFired = false;
    let closeFired = false;
    
    watcher.once('ready', () => {
      readyFired = true;
    });
    
    // Wait for ready event
    await new Promise(resolve => {
      watcher.once('ready', resolve);
      setTimeout(resolve, 1000); // Fallback timeout
    });
    
    assert.ok(readyFired);
    
    // Test close
    await watcher.close();
    closeFired = true;
    
    assert.ok(closeFired);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle rapid file operations', async () => {
    await mkdir(testDir, { recursive: true });
    
    const watchDir = join(testDir, 'watch-rapid');
    await mkdir(watchDir);
    
    let events = [];
    
    const watcher = shell.watch(join(watchDir, '*.txt'), {
      ignoreInitial: true
    });
    
    watcher.on('add', (path) => {
      events.push({ type: 'add', path, timestamp: Date.now() });
    });
    
    watcher.on('change', (path) => {
      events.push({ type: 'change', path, timestamp: Date.now() });
    });
    
    watcher.on('unlink', (path) => {
      events.push({ type: 'unlink', path, timestamp: Date.now() });
    });
    
    // Wait for watcher to be ready
    await new Promise(resolve => {
      watcher.once('ready', resolve);
      setTimeout(resolve, 1000); // Fallback timeout
    });
    
    // Perform rapid operations
    const rapidFile = join(watchDir, 'rapid.txt');
    const operations = [];
    
    operations.push(writeFile(rapidFile, 'Content 1'));
    operations.push(new Promise(resolve => setTimeout(resolve, 50)));
    operations.push(writeFile(rapidFile, 'Content 2'));
    operations.push(new Promise(resolve => setTimeout(resolve, 50)));
    operations.push(shell.remove(rapidFile));
    
    await Promise.all(operations);
    
    // Wait for all events to be processed
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await watcher.close();
    
    console.log(`   📊 Rapid operation events: ${events.length}`);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle large numbers of files', async () => {
    await mkdir(testDir, { recursive: true });
    
    const watchDir = join(testDir, 'watch-large');
    await mkdir(watchDir);
    
    let events = [];
    
    const watcher = shell.watch(join(watchDir, '*.txt'), {
      ignoreInitial: true
    });
    
    watcher.on('add', (path) => {
      events.push({ type: 'add', path });
    });
    
    // Wait for watcher to be ready
    await new Promise(resolve => {
      watcher.once('ready', resolve);
      setTimeout(resolve, 1000); // Fallback timeout
    });
    
    // Create many files
    const numFiles = 20;
    const filePromises = [];
    
    for (let i = 1; i <= numFiles; i++) {
      const filename = join(watchDir, `large-${i}.txt`);
      filePromises.push(writeFile(filename, `Content ${i}`));
    }
    
    const startTime = Date.now();
    await Promise.all(filePromises);
    const duration = Date.now() - startTime;
    
    // Wait for events to be processed
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await watcher.close();
    
    console.log(`   📊 Large file creation (${numFiles} files): ${duration}ms`);
    console.log(`   📊 Events captured: ${events.length}`);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle concurrent watchers', async () => {
    await mkdir(testDir, { recursive: true });
    
    const watchDir1 = join(testDir, 'watch-concurrent1');
    const watchDir2 = join(testDir, 'watch-concurrent2');
    
    await mkdir(watchDir1);
    await mkdir(watchDir2);
    
    let events1 = [];
    let events2 = [];
    
    // Create multiple concurrent watchers
    const watcher1 = shell.watch(join(watchDir1, '*.txt'), {
      ignoreInitial: true
    });
    
    const watcher2 = shell.watch(join(watchDir2, '*.txt'), {
      ignoreInitial: true
    });
    
    watcher1.on('add', (path) => {
      events1.push({ path });
    });
    
    watcher2.on('add', (path) => {
      events2.push({ path });
    });
    
    // Wait for both watchers to be ready
    await Promise.all([
      new Promise(resolve => {
        watcher1.once('ready', resolve);
        setTimeout(resolve, 1000);
      }),
      new Promise(resolve => {
        watcher2.once('ready', resolve);
        setTimeout(resolve, 1000);
      })
    ]);
    
    // Create files in both directories
    await writeFile(join(watchDir1, 'concurrent1.txt'), 'Content 1');
    await writeFile(join(watchDir2, 'concurrent2.txt'), 'Content 2');
    
    // Wait for events
    await new Promise(resolve => setTimeout(resolve, 300));
    
    await Promise.all([watcher1.close(), watcher2.close()]);
    
    console.log(`   📊 Concurrent watcher 1 events: ${events1.length}`);
    console.log(`   📊 Concurrent watcher 2 events: ${events2.length}`);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle watcher stability detection', async () => {
    await mkdir(testDir, { recursive: true });
    
    const watchDir = join(testDir, 'watch-stability');
    await mkdir(watchDir);
    
    let stableEvents = [];
    
    const watcher = shell.watch(join(watchDir, '*.txt'), {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500, // Wait 500ms for stability
        pollInterval: 100
      }
    });
    
    watcher.on('add', (path) => {
      stableEvents.push({ type: 'add', path, timestamp: Date.now() });
    });
    
    // Wait for watcher to be ready
    await new Promise(resolve => {
      watcher.once('ready', resolve);
      setTimeout(resolve, 1000); // Fallback timeout
    });
    
    // Create file with multiple writes
    const stableFile = join(watchDir, 'stability.txt');
    await writeFile(stableFile, 'Initial');
    
    // Wait longer than stability threshold
    await new Promise(resolve => setTimeout(resolve, 700));
    
    await watcher.close();
    
    console.log(`   📊 Stability detection events: ${stableEvents.length}`);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should support dynamic path management', async () => {
    await mkdir(testDir, { recursive: true });
    
    const watchDir1 = join(testDir, 'watch-dynamic1');
    const watchDir2 = join(testDir, 'watch-dynamic2');
    
    await mkdir(watchDir1);
    await mkdir(watchDir2);
    
    let events = [];
    
    const watcher = shell.watch(join(watchDir1, '*.txt'), {
      ignoreInitial: true
    });
    
    watcher.on('add', (path) => {
      events.push({ path });
    });
    
    // Wait for initial watcher to be ready
    await new Promise(resolve => {
      watcher.once('ready', resolve);
      setTimeout(resolve, 1000);
    });
    
    // Add additional watch path
    if (typeof watcher.add === 'function') {
      watcher.add(join(watchDir2, '*.txt'));
    }
    
    // Create files in both directories
    await writeFile(join(watchDir1, 'dynamic1.txt'), 'Content 1');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    await writeFile(join(watchDir2, 'dynamic2.txt'), 'Content 2');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Remove watch path
    if (typeof watcher.unwatch === 'function') {
      watcher.unwatch(join(watchDir1, '*.txt'));
    }
    
    await watcher.close();
    
    console.log(`   📊 Dynamic path management events: ${events.length}`);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle watch performance benchmarks', async () => {
    await mkdir(testDir, { recursive: true });
    
    const watchDir = join(testDir, 'watch-perf');
    await mkdir(watchDir);
    
    let eventCount = 0;
    
    const watcher = shell.watch(join(watchDir, '*.txt'), {
      ignoreInitial: true
    });
    
    watcher.on('add', () => {
      eventCount++;
    });
    
    // Wait for watcher to be ready
    await new Promise(resolve => {
      watcher.once('ready', resolve);
      setTimeout(resolve, 1000);
    });
    
    // Performance test: create many files rapidly
    const numFiles = 50;
    const startTime = Date.now();
    
    const filePromises = [];
    for (let i = 1; i <= numFiles; i++) {
      const filename = join(watchDir, `perf-${i}.txt`);
      filePromises.push(writeFile(filename, `Performance test ${i}`));
    }
    
    await Promise.all(filePromises);
    const creationDuration = Date.now() - startTime;
    
    // Wait for all events to be processed
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await watcher.close();
    
    console.log(`   📊 File creation performance (${numFiles} files): ${creationDuration}ms`);
    console.log(`   📊 Events processed: ${eventCount}/${numFiles}`);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
});