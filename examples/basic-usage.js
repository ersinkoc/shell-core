#!/usr/bin/env node

/**
 * @oxog/shell-core - Basic Usage Examples
 * 
 * This example demonstrates the basic features of the shell-core library:
 * - File system operations
 * - Command execution
 * - Text processing
 * - Configuration options
 * - Error handling
 * 
 * Author: Ersin KOÇ
 * Repository: https://github.com/ersinkoc/shell-core
 */

import { createShell } from '@oxog/shell-core';
import { join } from 'path';
import { tmpdir } from 'os';

async function basicUsageDemo() {
  console.log('🚀 @oxog/shell-core - Basic Usage Demo');
  console.log('=====================================\n');
  
  // Create shell instance with configuration
  const shell = createShell({
    silent: false,
    verbose: true
  });
  
  const demoDir = join(tmpdir(), 'shell-core-basic-demo-' + Date.now());
  
  try {
    // 1. Directory and File Operations
    console.log('📁 File System Operations');
    console.log('--------------------------');
    
    // Create demo directory
    await shell.mkdir(demoDir, { recursive: true });
    console.log(`✅ Created directory: ${demoDir}`);
    
    // Create test files
    await shell.writeFile(join(demoDir, 'hello.txt'), 'Hello, World!\nThis is a test file.\nGoodbye!');
    await shell.writeFile(join(demoDir, 'data.txt'), 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
    console.log('✅ Created test files');
    
    // Copy file
    await shell.copy(join(demoDir, 'hello.txt'), join(demoDir, 'hello-copy.txt'));
    console.log('✅ Copied hello.txt to hello-copy.txt');
    
    // Move file
    await shell.move(join(demoDir, 'hello-copy.txt'), join(demoDir, 'hello-moved.txt'));
    console.log('✅ Moved file to hello-moved.txt');
    
    // Get file info
    const fileInfo = await shell.stat(join(demoDir, 'hello.txt'));
    console.log(`✅ File size: ${fileInfo.size} bytes, modified: ${fileInfo.mtime.toISOString()}`);
    
    console.log();
    
    // 2. Command Execution
    console.log('⚡ Command Execution');
    console.log('--------------------');
    
    // Simple command
    const nodeVersion = await shell.exec('node --version');
    console.log(`✅ Node.js version: ${nodeVersion.stdout.trim()}`);
    
    // Command with options
    const listFiles = await shell.exec(`ls "${demoDir}"`, { 
      timeout: 5000,
      silent: true 
    });
    console.log(`✅ Files in demo directory: ${listFiles.stdout.split('\\n').filter(f => f).length} files`);
    
    // Parallel execution
    const results = await shell.parallel([
      'echo "Command 1"',
      'echo "Command 2"', 
      'echo "Command 3"'
    ]);
    console.log(`✅ Executed ${results.length} commands in parallel`);
    
    console.log();
    
    // 3. Text Processing
    console.log('📄 Text Processing');
    console.log('------------------');
    
    // Read file content
    const content = await shell.readFile(join(demoDir, 'data.txt'));
    console.log(`✅ Read ${content.length} characters from data.txt`);
    
    // Text processing chain
    const processed = shell.text(content)
      .grep('Line')
      .head(3)
      .sort()
      .result;
    
    console.log('✅ Processed text:');
    processed.forEach((line, i) => console.log(`   ${i + 1}. ${line}`));
    
    // Grep operation
    const grepResults = await shell.grep('Line [13]', join(demoDir, 'data.txt'));
    console.log(`✅ Found ${grepResults.length} matching lines with grep`);
    
    console.log();
    
    // 4. Pipeline Operations
    console.log('🔗 Pipeline Operations');
    console.log('----------------------');
    
    // Create more test files for pipeline demo
    await shell.writeFile(join(demoDir, 'small.txt'), 'Small file');
    await shell.writeFile(join(demoDir, 'large.txt'), 'Large file content '.repeat(100));
    
    // File pipeline
    await shell.pipeline()
      .glob(join(demoDir, '*.txt'))
      .filterBySize({ min: 20 }) // Files larger than 20 bytes
      .map(file => {
        console.log(`   Processing: ${file.split('/').pop()}`);
        return file;
      })
      .execute();
    
    console.log('✅ Pipeline processed files successfully');
    
    console.log();
    
    // 5. Configuration Demo
    console.log('⚙️ Configuration Options');
    console.log('------------------------');
    
    // Create shell with different config
    const silentShell = createShell({
      silent: true,
      timeout: 10000,
      retries: 2
    });
    
    const config = silentShell.getConfig();
    console.log(`✅ Silent shell - timeout: ${config.timeout}ms, retries: ${config.retries}`);
    
    // Show current config
    const currentConfig = shell.getConfig();
    console.log(`✅ Current shell - silent: ${currentConfig.silent}, verbose: ${currentConfig.verbose}`);
    
    console.log();
    
    // 6. Error Handling
    console.log('🛡️ Error Handling');
    console.log('------------------');
    
    try {
      await shell.readFile('/nonexistent/file.txt');
    } catch (error) {
      console.log(`✅ Caught expected error: ${error.message}`);
      console.log(`   Error type: ${error.constructor.name}, code: ${error.code}`);
    }
    
    // Retry mechanism demo
    console.log('✅ Retry mechanism will automatically handle transient failures');
    
    console.log();
    
    // 7. Watch System (if supported)
    console.log('👀 Watch System Demo');
    console.log('--------------------');
    
    const watchFile = join(demoDir, 'watched.txt');
    await shell.writeFile(watchFile, 'Initial content');
    
    console.log('✅ File watcher is available for monitoring changes');
    console.log('   (Use shell.watch() to monitor directory changes)');
    
    console.log();
    
    // 8. Performance Stats
    console.log('📊 Performance Statistics');
    console.log('-------------------------');
    
    const stats = shell.getStats();
    console.log(`✅ Commands executed: ${stats.commandsExecuted || 0}`);
    console.log(`✅ Files processed: ${stats.filesProcessed || 0}`);
    console.log(`✅ Active plugins: ${stats.plugins.length}`);
    
    console.log();
    
    // Cleanup
    console.log('🧹 Cleanup');
    console.log('-----------');
    await shell.remove(demoDir, { recursive: true, force: true });
    console.log('✅ Cleaned up demo directory');
    
    console.log();
    console.log('🎉 Basic usage demo completed successfully!');
    console.log('📚 Check out more examples in the examples/ directory');
    console.log('📖 Full documentation: https://github.com/ersinkoc/shell-core#readme');
    
  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Cleanup on error
    try {
      await shell.remove(demoDir, { recursive: true, force: true });
      console.log('🧹 Cleaned up after error');
    } catch (cleanupError) {
      console.error('⚠️ Cleanup failed:', cleanupError.message);
    }
    
    process.exit(1);
  }
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  basicUsageDemo().catch(console.error);
}