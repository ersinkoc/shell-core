import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'path';
import { writeFile, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { createShell } from '../dist/esm/index.js';

const testDir = join(tmpdir(), 'shell-process-test-' + Date.now());
const shell = createShell({ silent: true, retries: 0 });

describe('Process Execution Tests', () => {
  
  test('should execute simple commands', async () => {
    const result = await shell.exec('echo "Hello World"');
    
    assert.equal(result.success, true);
    assert.equal(result.code, 0);
    assert.ok(result.stdout.includes('Hello World'));
    assert.equal(typeof result.duration, 'number');
    assert.ok(result.duration >= 0);
  });
  
  test('should handle command failures', async () => {
    const result = await shell.exec('nonexistentcommand12345');
    
    assert.equal(result.success, false);
    assert.notEqual(result.code, 0);
    assert.ok(result.stderr.length > 0 || result.stdout.includes('not found') || result.stdout.includes('not recognized'));
  });
  
  test('should execute commands with options', async () => {
    await mkdir(testDir, { recursive: true });
    
    // Test with custom working directory
    const result = await shell.exec('echo "Current dir test"', {
      cwd: testDir,
      timeout: 5000
    });
    
    assert.equal(result.success, true);
    assert.ok(result.stdout.includes('Current dir test'));
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle command timeout', async () => {
    // Use a cross-platform sleep command
    const sleepCmd = process.platform === 'win32' 
      ? 'timeout /t 3 /nobreak' 
      : 'sleep 3';
    
    const startTime = Date.now();
    const result = await shell.exec(sleepCmd, { timeout: 1000 });
    const duration = Date.now() - startTime;
    
    assert.equal(result.success, false);
    assert.ok(duration < 2000); // Should timeout before 2 seconds
    
    console.log(`   📊 Timeout test duration: ${duration}ms`);
  });
  
  test('should spawn processes with arguments', async () => {
    const result = await shell.spawn('node', ['--version']);
    
    assert.equal(result.success, true);
    assert.equal(result.code, 0);
    assert.ok(result.stdout.includes('v') && result.stdout.match(/\d+\.\d+\.\d+/));
  });
  
  test('should handle spawn with custom options', async () => {
    await mkdir(testDir, { recursive: true });
    
    const testScript = join(testDir, 'test-script.js');
    await writeFile(testScript, 'console.log("Script output:", process.cwd());');
    
    const result = await shell.spawn('node', [testScript], {
      cwd: testDir,
      timeout: 5000
    });
    
    assert.equal(result.success, true);
    assert.ok(result.stdout.includes('Script output:'));
    // The output should contain the actual directory path
    assert.ok(result.stdout.includes(testDir));
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should execute parallel commands', async () => {
    const commands = [
      'echo "Command 1"',
      'echo "Command 2"',
      'echo "Command 3"'
    ];
    
    const startTime = Date.now();
    const results = await shell.parallel(commands, {
      concurrency: 2,
      failFast: false
    });
    const duration = Date.now() - startTime;
    
    assert.equal(results.length, 3);
    
    results.forEach((result, index) => {
      assert.equal(result.success, true);
      assert.ok(result.stdout.includes(`Command ${index + 1}`));
    });
    
    console.log(`   📊 Parallel execution (3 commands): ${duration}ms`);
  });
  
  test('should handle parallel execution with failures', async () => {
    const commands = [
      'echo "Success 1"',
      'nonexistentcommand',
      'echo "Success 2"'
    ];
    
    const results = await shell.parallel(commands, {
      failFast: false
    });
    
    assert.equal(results.length, 3);
    assert.equal(results[0].success, true);
    assert.equal(results[1].success, false);
    assert.equal(results[2].success, true);
  });
  
  test('should support fail-fast mode', async () => {
    const commands = [
      'echo "This should run"',
      'nonexistentcommand',
      'echo "This might not run"'
    ];
    
    try {
      await shell.parallel(commands, { failFast: true });
      assert.fail('Should have thrown on first failure');
    } catch (error) {
      assert.ok(error.message.includes('Command failed'));
    }
  });
  
  test('should find executables in PATH', async () => {
    const nodePath = await shell.which('node');
    assert.ok(nodePath);
    assert.ok(nodePath.includes('node'));
    
    // Test with non-existent command
    const nonExistent = await shell.which('nonexistentcommand12345');
    assert.equal(nonExistent, null);
  });
  
  test('should handle environment variables', async () => {
    const result = await shell.exec('node -e "console.log(process.env.TEST_VAR)"', {
      env: {
        ...process.env,
        TEST_VAR: 'test-value'
      }
    });
    
    assert.equal(result.success, true);
    assert.ok(result.stdout.includes('test-value'));
  });
  
  test('should handle stdio configuration', async () => {
    const result = await shell.spawn('node', ['-e', 'console.log("stdio test")'], {
      stdio: 'pipe'
    });
    
    assert.equal(result.success, true);
    assert.ok(result.stdout.includes('stdio test'));
  });
  
  test('should handle large output buffers', async () => {
    // Generate a large output (10KB)
    const largeOutputCmd = 'node -e "console.log(\'x\'.repeat(10240))"';
    
    const result = await shell.exec(largeOutputCmd, {
      maxBuffer: 50 * 1024 // 50KB buffer
    });
    
    assert.equal(result.success, true);
    assert.ok(result.stdout.length > 10000);
    
    console.log(`   📊 Large output size: ${result.stdout.length} bytes`);
  });
  
  test('should handle input to processes', async () => {
    await mkdir(testDir, { recursive: true });
    
    const inputScript = join(testDir, 'input-test.js');
    await writeFile(inputScript, `
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (data) => {
        console.log('Received:', data.trim());
        process.exit(0);
      });
    `);
    
    const result = await shell.spawn('node', [inputScript], {
      input: 'test input data',
      timeout: 5000
    });
    
    assert.equal(result.success, true);
    assert.ok(result.stdout.includes('Received: test input data'));
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle process signals', async () => {
    // Skip on Windows as signal handling is different
    if (process.platform === 'win32') {
      console.log('   ⏭️  Skipping signal tests on Windows');
      return;
    }
    
    await mkdir(testDir, { recursive: true });
    
    const signalScript = join(testDir, 'signal-test.js');
    await writeFile(signalScript, `
      process.on('SIGTERM', () => {
        console.log('Received SIGTERM');
        process.exit(0);
      });
      
      setTimeout(() => {
        console.log('Still running...');
      }, 5000);
    `);
    
    const startTime = Date.now();
    const result = await shell.spawn('node', [signalScript], {
      killSignal: 'SIGTERM',
      timeout: 2000
    });
    const duration = Date.now() - startTime;
    
    assert.ok(duration < 3000); // Should be killed before timeout
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle command retries', async () => {
    let attempts = 0;
    
    // Create a command that fails first two times
    await mkdir(testDir, { recursive: true });
    const retryScript = join(testDir, 'retry-test.js');
    await writeFile(retryScript, `
      const fs = require('fs');
      const path = require('path');
      const attemptFile = path.join('${testDir.replace(/\\/g, '\\\\')}', 'attempts.txt');
      
      let attempts = 0;
      try {
        attempts = parseInt(fs.readFileSync(attemptFile, 'utf8')) || 0;
      } catch (e) {}
      
      attempts++;
      fs.writeFileSync(attemptFile, attempts.toString());
      
      if (attempts < 3) {
        console.log('Attempt', attempts, 'failed');
        process.exit(1);
      } else {
        console.log('Attempt', attempts, 'succeeded');
        process.exit(0);
      }
    `);
    
    const result = await shell.exec(`node "${retryScript}"`, {
      retry: {
        attempts: 3,
        delay: 100,
        backoff: 1,
        shouldRetry: (error) => true
      }
    });
    
    assert.equal(result.success, true);
    assert.ok(result.stdout.includes('succeeded'));
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle concurrent process execution', async () => {
    const numProcs = 5;
    const processes = [];
    
    for (let i = 0; i < numProcs; i++) {
      processes.push(
        shell.exec(`echo "Process ${i}"`)
      );
    }
    
    const startTime = Date.now();
    const results = await Promise.all(processes);
    const duration = Date.now() - startTime;
    
    assert.equal(results.length, numProcs);
    results.forEach((result, index) => {
      assert.equal(result.success, true);
      assert.ok(result.stdout.includes(`Process ${index}`));
    });
    
    console.log(`   📊 Concurrent processes (${numProcs}): ${duration}ms`);
  });
  
  test('should handle process cleanup', async () => {
    await mkdir(testDir, { recursive: true });
    
    const cleanupScript = join(testDir, 'cleanup-test.js');
    await writeFile(cleanupScript, `
      process.on('exit', () => {
        console.log('Process cleanup executed');
      });
      
      setTimeout(() => {
        process.exit(0);
      }, 100);
    `);
    
    const result = await shell.spawn('node', [cleanupScript]);
    
    assert.equal(result.success, true);
    assert.ok(result.stdout.includes('Process cleanup executed'));
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should measure execution performance', async () => {
    const iterations = 10;
    const results = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      const result = await shell.exec('echo "Performance test"');
      const duration = Date.now() - startTime;
      
      assert.equal(result.success, true);
      results.push(duration);
    }
    
    const avgDuration = results.reduce((sum, dur) => sum + dur, 0) / iterations;
    const minDuration = Math.min(...results);
    const maxDuration = Math.max(...results);
    
    console.log(`   📊 Performance stats (${iterations} executions):`);
    console.log(`       Average: ${avgDuration.toFixed(2)}ms`);
    console.log(`       Min: ${minDuration}ms, Max: ${maxDuration}ms`);
    
    assert.ok(avgDuration < 1000); // Should be reasonably fast
  });
  
  test('should handle error cases in process execution', async () => {
    // Test invalid working directory
    try {
      await shell.exec('echo "test"', { cwd: '/nonexistent/directory' });
      assert.fail('Should throw error for invalid cwd');
    } catch (error) {
      assert.ok(error.code === 'ENOENT' || error.message.includes('ENOENT'));
    }
    
    // Test negative timeout
    try {
      await shell.exec('echo "test"', { timeout: -1 });
      assert.fail('Should throw error for negative timeout');
    } catch (error) {
      assert.ok(error.message.includes('timeout') || error.message.includes('must be positive'));
    }
    
    // Test invalid command for spawn
    try {
      await shell.spawn('', []);
      assert.fail('Should throw error for empty command');
    } catch (error) {
      assert.ok(error.message.length > 0);
    }
  });
  
});