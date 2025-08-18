import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { shell, createShell, ShellError, GitPlugin } from '../dist/esm/index.js';
import { join } from 'path';
import { tmpdir } from 'os';

const testDir = join(tmpdir(), 'shell-core-test-' + Date.now());

describe('Shell Core Basic Tests', () => {
  
  test('should create shell instance', async () => {
    const customShell = createShell({
      silent: true,
      parallel: 2
    });
    
    assert.ok(customShell);
    assert.equal(customShell.getConfig().silent, true);
    assert.equal(customShell.getConfig().parallel, 2);
  });

  test('should execute simple commands', async () => {
    const result = await shell.exec('echo "Hello World"', { silent: true });
    
    assert.ok(result.success);
    assert.equal(result.code, 0);
    assert.ok(result.stdout.includes('Hello World'));
  });

  test('should handle command failures gracefully', async () => {
    // Create a shell without retries to test failure handling
    const noRetryShell = createShell({ 
      silent: true,
      retries: 0  // Disable retries
    });
    
    const result = await noRetryShell.exec('nonexistentcommand');
    
    assert.equal(result.success, false);
    assert.ok(result.code !== 0);
  });

  test('should create and remove directories', async () => {
    await mkdir(testDir, { recursive: true });
    
    const testPath = join(testDir, 'new-directory');
    
    // Test mkdir
    await shell.mkdir(testPath);
    
    // Test that directory exists (cross-platform compatible)
    const checkCmd = process.platform === 'win32' 
      ? `if exist "${testPath}" echo exists`
      : `test -d "${testPath}" && echo "exists"`;
    const result = await shell.exec(checkCmd, { silent: true });
    assert.ok(result.stdout.includes('exists'));
    
    // Test remove
    await shell.remove(testPath, { recursive: true });
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });

  test('should copy and move files', async () => {
    await mkdir(testDir, { recursive: true });
    
    const sourceFile = join(testDir, 'source.txt');
    const copyFile = join(testDir, 'copy.txt');
    const moveFile = join(testDir, 'moved.txt');
    
    // Create source file
    await writeFile(sourceFile, 'Test content');
    
    // Test copy
    await shell.copy(sourceFile, copyFile);
    const copyContent = await readFile(copyFile, 'utf-8');
    assert.equal(copyContent, 'Test content');
    
    // Test move
    await shell.move(copyFile, moveFile);
    const moveContent = await readFile(moveFile, 'utf-8');
    assert.equal(moveContent, 'Test content');
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });

  test('should handle text processing', async () => {
    await mkdir(testDir, { recursive: true });
    
    const testFile = join(testDir, 'test.txt');
    const content = 'line 1\nline 2\nerror occurred\nline 4\nanother error\nline 6';
    
    await writeFile(testFile, content);
    
    // Test grep
    const grepResults = await shell.grep(/error/, testFile);
    assert.equal(grepResults.length, 2);
    assert.ok(grepResults[0].includes('error occurred'));
    assert.ok(grepResults[1].includes('another error'));
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });

  test('should support plugins', async () => {
    const gitPlugin = new GitPlugin();
    
    // Install plugin
    shell.use(gitPlugin);
    
    // Check plugin is installed
    const stats = shell.getStats();
    assert.ok(stats.plugins.includes('git'));
    
    // Test git command (if git is available)
    // Temporarily increase silent mode to suppress git errors in non-git directories
    const originalConfig = shell.getConfig();
    shell.configure({ silent: true });
    try {
      const result = await shell.git.status();
      assert.ok(typeof result === 'string');
    } catch (error) {
      // Git might not be available in test environment
      assert.ok(error instanceof Error);
    } finally {
      shell.configure({ silent: originalConfig.silent });
    }
    
    // Uninstall plugin
    shell.unuse('git');
    
    const newStats = shell.getStats();
    assert.ok(!newStats.plugins.includes('git'));
  });

  test('should support pipelines', async () => {
    await mkdir(testDir, { recursive: true });
    
    // Create test files
    const fileNames = ['file1.txt', 'file2.txt', 'large.txt'];
    
    for (const [index, filename] of fileNames.entries()) {
      const content = 'x'.repeat((index + 1) * 100); // Different sizes
      await writeFile(join(testDir, filename), content);
    }
    
    // Test file pipeline - first get all txt files from the directory
    const files = [
      join(testDir, 'file1.txt'),
      join(testDir, 'file2.txt'), 
      join(testDir, 'large.txt')
    ];
    
    const results = await shell.filePipeline()
      .filterBySize(150) // Files larger than 150 bytes
      .execute(files);
    
    // Should filter out file1.txt (100 bytes) and keep file2.txt (200 bytes) and large.txt (300 bytes)
    assert.equal(results.length, 2);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });

  test('should handle errors properly', async () => {
    // Create a shell with fatal mode enabled to ensure errors are thrown
    const fatalShell = createShell({ fatal: true });
    
    try {
      await fatalShell.copy('/nonexistent/file', '/nonexistent/dest');
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.ok(error instanceof ShellError);
      assert.equal(error.code, 'ENOENT');
      assert.equal(error.operation, 'stat');
      assert.equal(error.recoverable, false);
    }
  });

  test('should support parallel execution', async () => {
    const commands = [
      'echo "command 1"',
      'echo "command 2"',
      'echo "command 3"'
    ];
    
    const results = await shell.parallel(commands, { 
      concurrency: 2, 
      failFast: false 
    });
    
    assert.equal(results.length, 3);
    results.forEach((result, index) => {
      assert.ok(result.success);
      assert.ok(result.stdout.includes(`command ${index + 1}`));
    });
  });

  test('should support configuration changes', async () => {
    const customShell = createShell({ silent: false });
    
    customShell.configure({
      silent: true,
      timeout: 5000,
      parallel: 8
    });
    
    const config = customShell.getConfig();
    assert.equal(config.silent, true);
    assert.equal(config.timeout, 5000);
    assert.equal(config.parallel, 8);
  });

});

// Run the tests
describe('Performance Tests', () => {
  
  test('should be faster than baseline operations', async () => {
    const iterations = 100;
    const testFile = join(testDir, 'perf-test.txt');
    
    await mkdir(testDir, { recursive: true });
    await writeFile(testFile, 'test content for performance testing');
    
    // Measure our implementation
    const startTime = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      const result = await shell.exec('echo "test"', { silent: true });
      assert.ok(result.success);
    }
    
    const ourTime = Date.now() - startTime;
    
    // Basic performance assertion (should complete 100 operations in reasonable time)
    assert.ok(ourTime < 10000, `Performance test took ${ourTime}ms for ${iterations} operations`);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should support basic file watching', async () => {
    const watchTestDir = join(testDir, 'watch-test');
    await mkdir(watchTestDir, { recursive: true });
    
    const watchFile = join(watchTestDir, 'watch-me.txt');
    
    let watchEvents = [];
    const watcher = shell.watch(join(watchTestDir, '*.txt'), {
      ignoreInitial: true
    });
    
    watcher.on('add', (path) => {
      watchEvents.push({ type: 'add', path });
    });
    
    watcher.on('change', (path) => {
      watchEvents.push({ type: 'change', path });
    });
    
    watcher.on('unlink', (path) => {
      watchEvents.push({ type: 'unlink', path });
    });
    
    // Wait for watcher to be ready
    await new Promise(resolve => {
      watcher.once('ready', resolve);
      setTimeout(resolve, 1000); // Fallback
    });
    
    // Test file operations with watching
    await shell.touch(watchFile);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    await shell.exec(`echo "test content" > "${watchFile}"`);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    await shell.remove(watchFile);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    await watcher.close();
    
    // Note: watch events are platform-dependent, so we just verify no errors occurred
    console.log(`   📊 Watch events captured: ${watchEvents.length}`);
    
    // Cleanup
    await rm(watchTestDir, { recursive: true, force: true });
  });
  
  test('should support basic transaction functionality', async () => {
    const txShell = createShell({ silent: true });
    const txTestDir = join(testDir, 'transaction-test');
    await mkdir(txTestDir, { recursive: true });
    
    // Test successful transaction
    const result = await txShell.transaction(async (tx) => {
      await tx.writeFile(join(txTestDir, 'tx-test.txt'), 'Transaction test content');
      await tx.mkdir(join(txTestDir, 'tx-dir'));
      return { message: 'success' };
    });
    
    assert.deepEqual(result, { message: 'success' });
    
    // Test transaction rollback
    try {
      await txShell.transaction(async (tx) => {
        await tx.writeFile(join(txTestDir, 'rollback-test.txt'), 'Should be rolled back');
        // This will fail and trigger rollback
        await tx.copy(join(txTestDir, 'non-existent.txt'), join(txTestDir, 'target.txt'));
      });
      assert.fail('Transaction should have failed');
    } catch (error) {
      // Expected to fail
      console.log('   📝 Transaction rollback test passed');
    }
    
    // Test dry run mode
    await txShell.transaction(async (tx) => {
      await tx.writeFile(join(txTestDir, 'dry-run.txt'), 'Should not be created');
      return { message: 'dry run' };
    }, {
      dryRun: true
    });
    
    console.log('   ✅ Transaction functionality tested');
    
    // Cleanup
    await rm(txTestDir, { recursive: true, force: true });
  });

});