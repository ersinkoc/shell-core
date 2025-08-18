#!/usr/bin/env node

/**
 * @oxog/shell-core Watch Mode Demo
 * 
 * This example demonstrates the comprehensive file watching and hot-reload capabilities
 * of @oxog/shell-core, showcasing cross-platform file monitoring with advanced features.
 */

import { shell, createHotReloader } from '../dist/esm/index.js';
import { createWriteStream } from 'fs';
import { join } from 'path';

async function watchModeDemo() {
  console.log('🎬 @oxog/shell-core Watch Mode Demonstration');
  console.log('============================================\n');

  // Setup demo workspace
  const workspaceDir = join(process.cwd(), 'watch-demo-workspace');
  
  try {
    // Clean and create workspace
    await shell.remove(workspaceDir, { recursive: true, force: true });
    await shell.mkdir(workspaceDir, { recursive: true });
    
    console.log('📁 Created demo workspace:', workspaceDir);
    
    // Create some initial files for demonstration
    await shell.touch(join(workspaceDir, 'app.js'));
    await shell.touch(join(workspaceDir, 'config.json'));
    await shell.mkdir(join(workspaceDir, 'src'), { recursive: true });
    await shell.touch(join(workspaceDir, 'src', 'index.js'));
    await shell.touch(join(workspaceDir, 'src', 'utils.js'));
    
    console.log('✅ Created initial files for demonstration\n');

    // Demo 1: Basic File Watching
    console.log('📋 Demo 1: Basic File Watching');
    console.log('------------------------------');
    
    const basicWatcher = shell.watch([
      join(workspaceDir, '**/*.js'),
      join(workspaceDir, '**/*.json')
    ], {
      ignoreInitial: true,
      recursive: true,
      ignored: '**/node_modules/**'
    });
    
    let changeCount = 0;
    let addCount = 0;
    let removeCount = 0;
    
    basicWatcher.on('change', (path, stats) => {
      changeCount++;
      console.log(`🔄 File changed: ${path} (${stats ? `${stats.size} bytes` : 'unknown size'})`);
    });
    
    basicWatcher.on('add', (path, stats) => {
      addCount++;
      console.log(`➕ File added: ${path} (${stats ? `${stats.size} bytes` : 'unknown size'})`);
    });
    
    basicWatcher.on('unlink', (path) => {
      removeCount++;
      console.log(`❌ File removed: ${path}`);
    });
    
    basicWatcher.on('ready', () => {
      console.log('👀 Basic watcher is ready and monitoring files...');
    });
    
    basicWatcher.on('error', (error) => {
      console.error('❌ Watcher error:', error.message);
    });
    
    // Demo 2: Hot Reloader for Development
    console.log('\n📋 Demo 2: Hot Reloader for Development');
    console.log('--------------------------------------');
    
    const hotReloader = createHotReloader({
      debounceTime: 500, // Wait 500ms for file stability
      extensions: ['js', 'json', 'ts'],
      ignored: (path) => path.includes('node_modules') || path.includes('.git')
    });
    
    let reloadCount = 0;
    
    hotReloader.watch(workspaceDir)
      .on('reload', ({ path, eventType, timestamp }) => {
        reloadCount++;
        console.log(`🔥 Hot reload triggered by ${eventType} in ${path} at ${timestamp.toLocaleTimeString()}`);
        console.log(`   📊 Total reloads: ${reloadCount}`);
        
        // Simulate reload actions
        if (path.endsWith('.js')) {
          console.log('   🔄 Restarting JavaScript application...');
        } else if (path.endsWith('.json')) {
          console.log('   📝 Reloading configuration...');
        }
      })
      .on('error', (error) => {
        console.error('❌ Hot reloader error:', error.message);
      });
    
    // Demo 3: Advanced Watching with Stability Detection
    console.log('\n📋 Demo 3: Advanced Watching with Write Stability');
    console.log('--------------------------------------------------');
    
    const advancedWatcher = shell.watch(join(workspaceDir, 'large-file.txt'), {
      awaitWriteFinish: {
        stabilityThreshold: 1000, // Wait 1 second for file stability
        pollInterval: 100
      },
      ignoreInitial: true
    });
    
    advancedWatcher.on('change', (path, stats) => {
      console.log(`📝 Large file write completed: ${path} (${stats.size} bytes)`);
      console.log(`   ⏰ File was stable for 1 second before emitting event`);
    });
    
    // Simulate file operations to trigger the watchers
    console.log('\n🎭 Simulating File Operations');
    console.log('=============================');
    
    // Wait a moment for watchers to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate normal file changes
    console.log('\n1️⃣ Modifying existing files...');
    await shell.exec(`echo "console.log('Hello from app.js');" > "${join(workspaceDir, 'app.js')}"`);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    await shell.exec(`echo '{"name": "demo", "version": "1.0.0"}' > "${join(workspaceDir, 'config.json')}"`);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Add new files
    console.log('\n2️⃣ Adding new files...');
    await shell.touch(join(workspaceDir, 'src', 'new-module.js'));
    await new Promise(resolve => setTimeout(resolve, 200));
    
    await shell.exec(`echo "export const VERSION = '1.0.0';" > "${join(workspaceDir, 'src', 'constants.js')}"`);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Simulate large file write (for stability detection)
    console.log('\n3️⃣ Writing large file with stability detection...');
    const largeFilePath = join(workspaceDir, 'large-file.txt');
    const writeStream = createWriteStream(largeFilePath);
    
    // Write data in chunks to simulate a large file being written
    for (let i = 0; i < 10; i++) {
      writeStream.write(`This is line ${i + 1} of a large file being written slowly.\n`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    writeStream.end();
    
    // Demo 4: Directory Operations
    console.log('\n4️⃣ Directory operations...');
    await shell.mkdir(join(workspaceDir, 'new-directory'), { recursive: true });
    await new Promise(resolve => setTimeout(resolve, 200));
    
    await shell.touch(join(workspaceDir, 'new-directory', 'file-in-new-dir.js'));
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Demo 5: File Removal
    console.log('\n5️⃣ Removing files...');
    await shell.remove(join(workspaceDir, 'src', 'utils.js'));
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Wait for all events to process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Statistics
    console.log('\n📊 Watch Demo Statistics');
    console.log('========================');
    console.log(`📈 File changes detected: ${changeCount}`);
    console.log(`➕ Files added: ${addCount}`);
    console.log(`❌ Files removed: ${removeCount}`);
    console.log(`🔥 Hot reload triggers: ${reloadCount}`);
    
    // Demonstrate watcher management
    console.log('\n🎛️ Watcher Management');
    console.log('=====================');
    
    console.log('📋 Watched paths (basic watcher):');
    const watchedPaths = basicWatcher.getWatched();
    Object.entries(watchedPaths).forEach(([dir, files]) => {
      console.log(`   📁 ${dir}: [${files.join(', ')}]`);
    });
    
    // Demo 6: Dynamic Path Management
    console.log('\n6️⃣ Dynamic path management...');
    
    // Add new paths to existing watcher
    await shell.mkdir(join(workspaceDir, 'dynamic'), { recursive: true });
    await shell.touch(join(workspaceDir, 'dynamic', 'test.js'));
    
    basicWatcher.add(join(workspaceDir, 'dynamic/**/*.js'));
    console.log('✅ Added new path to existing watcher');
    
    // Trigger change in new path
    await new Promise(resolve => setTimeout(resolve, 500));
    await shell.exec(`echo "// Dynamic file" > "${join(workspaceDir, 'dynamic', 'test.js')}"`);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Remove specific paths from watching
    basicWatcher.unwatch(join(workspaceDir, 'config.json'));
    console.log('✅ Removed config.json from watching');
    
    // This change should NOT trigger the watcher
    await shell.exec(`echo '{"updated": true}' > "${join(workspaceDir, 'config.json')}"`);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Performance test
    console.log('\n⚡ Performance Test: Rapid File Changes');
    console.log('======================================');
    
    const perfStart = Date.now();
    const perfWatcher = shell.watch(join(workspaceDir, 'perf-test-*.txt'), {
      ignoreInitial: true
    });
    
    let perfEventCount = 0;
    perfWatcher.on('add', () => perfEventCount++);
    perfWatcher.on('change', () => perfEventCount++);
    
    // Create and modify files rapidly
    const perfPromises = [];
    for (let i = 0; i < 20; i++) {
      perfPromises.push(shell.touch(join(workspaceDir, `perf-test-${i}.txt`)));
    }
    await Promise.all(perfPromises);
    
    // Wait for events to process
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const perfDuration = Date.now() - perfStart;
    console.log(`📊 Performance: ${perfEventCount} events processed in ${perfDuration}ms`);
    console.log(`⚡ Average: ${(perfDuration / perfEventCount).toFixed(2)}ms per event`);
    
    // Cleanup
    console.log('\n🧹 Cleaning Up');
    console.log('==============');
    
    console.log('🔄 Closing all watchers...');
    await basicWatcher.close();
    await advancedWatcher.close();
    await hotReloader.close();
    await perfWatcher.close();
    
    console.log('🗑️ Removing demo workspace...');
    await shell.remove(workspaceDir, { recursive: true, force: true });
    
    console.log('\n✅ Watch Mode Demo Completed Successfully!');
    console.log('\n🎯 Key Features Demonstrated:');
    console.log('   📁 Cross-platform file watching with native performance');
    console.log('   🔥 Hot reload capabilities for development workflows');
    console.log('   ⏰ Write stability detection for large file operations');
    console.log('   🎛️ Dynamic path management (add/remove paths from watchers)');
    console.log('   📊 High-performance event processing');
    console.log('   🛡️ Robust error handling and resource cleanup');
    console.log('   🔧 Configurable ignore patterns and options');
    console.log('   📈 Real-time statistics and monitoring');
    
  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    console.error(error.stack);
    
    // Attempt cleanup on error
    try {
      await shell.remove(workspaceDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('Failed to cleanup workspace:', cleanupError.message);
    }
    
    process.exit(1);
  }
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  watchModeDemo().catch(console.error);
}

export { watchModeDemo };