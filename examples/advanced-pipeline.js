import { shell, createShell } from '@oxog/shell-core';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

async function demonstrateAdvancedPipelines() {
  console.log('🌟 @oxog/shell-core Advanced Pipeline Demo\n');
  
  const demoDir = join(tmpdir(), 'shell-core-advanced-demo-' + Date.now());
  
  try {
    // Setup demo environment
    console.log('🏗️  Setting up demo environment...');
    await shell.mkdir(demoDir, { recursive: true });
    
    // Create a realistic project structure
    const srcDir = join(demoDir, 'src');
    const testDir = join(demoDir, 'test');
    const distDir = join(demoDir, 'dist');
    const docsDir = join(demoDir, 'docs');
    
    await Promise.all([
      shell.mkdir(srcDir, { recursive: true }),
      shell.mkdir(testDir, { recursive: true }),
      shell.mkdir(distDir, { recursive: true }),
      shell.mkdir(docsDir, { recursive: true })
    ]);
    
    // Create realistic source files with different sizes and types
    const files = [
      { path: join(srcDir, 'index.js'), content: 'console.log("Hello World");\n// Main entry point\nmodule.exports = { version: "1.0.0" };', size: 'small' },
      { path: join(srcDir, 'utils.js'), content: 'x'.repeat(2000) + '\n// Utility functions\nfunction helper() { return true; }', size: 'medium' },
      { path: join(srcDir, 'large-module.js'), content: 'x'.repeat(10000) + '\n// Large module with lots of code', size: 'large' },
      { path: join(testDir, 'index.test.js'), content: 'describe("tests", () => { it("should work", () => {}); });', size: 'small' },
      { path: join(testDir, 'utils.test.js'), content: 'const utils = require("../src/utils");\ntest("helper", () => {});', size: 'small' },
      { path: join(docsDir, 'README.md'), content: '# Project Documentation\n\nThis is a sample project.', size: 'small' },
      { path: join(docsDir, 'api.md'), content: '# API Documentation\n\n## Functions\n\n### helper()\nReturns true.', size: 'small' }
    ];
    
    for (const file of files) {
      await writeFile(file.path, file.content);
    }
    
    console.log(`✅ Created project structure with ${files.length} files\n`);
    
    // Demo 1: Complex File Processing Pipeline
    console.log('🔗 Demo 1: Complex File Processing Pipeline');
    console.log('   Finding JavaScript files, filtering by size, and processing...\n');
    
    const jsFiles = await shell.filePipeline()
      .find('**/*.js')
      .filterByType('file')
      .filterBySize(1000) // Files larger than 1KB
      .transform(async (file) => {
        const stats = await shell.exec(`wc -l "${file}"`, { silent: true });
        const lines = parseInt(stats.stdout.trim().split(' ')[0]) || 0;
        console.log(`   📄 ${file.split('\\').pop()}: ${lines} lines`);
        return { file, lines };
      })
      .filter((item) => item.lines > 5) // Only files with more than 5 lines
      .transform((item) => item.file) // Extract just the file path
      .execute([
        join(srcDir, 'index.js'),
        join(srcDir, 'utils.js'), 
        join(srcDir, 'large-module.js'),
        join(testDir, 'index.test.js'),
        join(testDir, 'utils.test.js')
      ]);
    
    console.log(`\n✅ Processed ${jsFiles.length} JavaScript files that met criteria\n`);
    
    // Demo 2: Text Processing Pipeline with Log Analysis
    console.log('🔗 Demo 2: Text Processing Pipeline - Log Analysis');
    console.log('   Analyzing simulated log data...\n');
    
    const logData = [
      '2024-01-01 10:00:01 INFO User login successful: user123',
      '2024-01-01 10:00:05 ERROR Database connection failed',
      '2024-01-01 10:00:10 INFO User logout: user123', 
      '2024-01-01 10:00:15 WARN Cache miss for key: user_data_456',
      '2024-01-01 10:00:20 ERROR API timeout: /api/users/789',
      '2024-01-01 10:00:25 INFO System startup complete',
      '2024-01-01 10:00:30 ERROR Authentication failed: invalid_token',
      '2024-01-01 10:00:35 INFO Scheduled job completed: backup_task'
    ];
    
    const errorAnalysis = await shell.textPipeline()
      .grep(/ERROR/, { ignoreCase: false })
      .transform((line) => {
        const parts = line.split(' ');
        const timestamp = `${parts[0]} ${parts[1]}`;
        const message = parts.slice(3).join(' ');
        return { timestamp, message, severity: 'ERROR' };
      })
      .execute(logData);
    
    console.log('   🚨 Error Analysis Results:');
    errorAnalysis.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error.timestamp}: ${error.message}`);
    });
    
    const logStats = await shell.textPipeline()
      .transform((line) => line.split(' ')[2]) // Extract log level
      .execute(logData);
    
    const levelCounts = logStats.reduce((counts, level) => {
      counts[level] = (counts[level] || 0) + 1;
      return counts;
    }, {});
    
    console.log('\n   📊 Log Level Statistics:');
    Object.entries(levelCounts).forEach(([level, count]) => {
      console.log(`   ${level}: ${count} entries`);
    });
    
    console.log();
    
    // Demo 3: Build Pipeline Simulation
    console.log('🔗 Demo 3: Build Pipeline Simulation');
    console.log('   Simulating a typical build process...\n');
    
    const buildPipeline = shell.pipeline()
      .transform(async (step) => {
        console.log(`   ⚙️  ${step.name}...`);
        
        // Simulate build step with realistic timing
        const duration = Math.random() * 500 + 100;
        await new Promise(resolve => setTimeout(resolve, duration));
        
        if (step.name === 'Run Tests' && Math.random() < 0.1) {
          throw new Error('Test failed: mock_test.js');
        }
        
        console.log(`   ✅ ${step.name} completed (${Math.round(duration)}ms)`);
        return { ...step, duration: Math.round(duration), success: true };
      })
      .progress((current, total) => {
        const percent = Math.round((current / total) * 100);
        console.log(`   📈 Build Progress: ${percent}% (${current}/${total})`);
      });
    
    const buildSteps = [
      { name: 'Install Dependencies', critical: true },
      { name: 'Lint Code', critical: false },
      { name: 'Run Tests', critical: true },
      { name: 'Build TypeScript', critical: true },
      { name: 'Bundle Assets', critical: false },
      { name: 'Generate Documentation', critical: false },
      { name: 'Create Distribution', critical: true }
    ];
    
    try {
      const buildResults = await buildPipeline.execute(buildSteps);
      const totalTime = buildResults.reduce((sum, result) => sum + result.duration, 0);
      console.log(`\n✅ Build completed successfully in ${totalTime}ms\n`);
    } catch (error) {
      console.log(`\n❌ Build failed: ${error.message}\n`);
    }
    
    // Demo 4: Parallel Processing with Concurrency Control
    console.log('🔗 Demo 4: Parallel Processing with Concurrency Control');
    console.log('   Processing multiple files with controlled concurrency...\n');
    
    const processingTasks = files.map((file, index) => ({
      id: index + 1,
      path: file.path,
      size: file.size
    }));
    
    const startTime = Date.now();
    
    const processedTasks = await shell.pipeline({ parallel: 3 })
      .transform(async (task) => {
        console.log(`   🔄 Processing task ${task.id}: ${task.path.split('\\').pop()}`);
        
        // Simulate processing time based on file size
        const processingTime = {
          small: 100 + Math.random() * 100,
          medium: 200 + Math.random() * 200,
          large: 500 + Math.random() * 300
        }[task.size];
        
        await new Promise(resolve => setTimeout(resolve, processingTime));
        
        console.log(`   ✅ Task ${task.id} completed (${Math.round(processingTime)}ms)`);
        return { ...task, processingTime: Math.round(processingTime) };
      })
      .execute(processingTasks);
    
    const totalProcessingTime = Date.now() - startTime;
    const avgProcessingTime = processedTasks.reduce((sum, task) => sum + task.processingTime, 0) / processedTasks.length;
    
    console.log(`\n📊 Processing Results:`);
    console.log(`   Total files processed: ${processedTasks.length}`);
    console.log(`   Total time: ${totalProcessingTime}ms`);
    console.log(`   Average processing time: ${Math.round(avgProcessingTime)}ms`);
    console.log(`   Concurrency efficiency: ${Math.round((avgProcessingTime * processedTasks.length) / totalProcessingTime * 100)}%\n`);
    
    // Demo 5: Custom Shell Configuration with Different Strategies
    console.log('🔗 Demo 5: Custom Shell Configurations');
    console.log('   Demonstrating different shell configurations...\n');
    
    // High-performance shell for bulk operations
    const fastShell = createShell({
      silent: true,
      parallel: 8,
      timeout: 5000,
      cache: true,
      verbose: false
    });
    
    // Verbose shell for debugging
    const debugShell = createShell({
      silent: false,
      parallel: 1,
      timeout: 30000,
      verbose: true,
      fatal: false
    });
    
    // Production shell with error handling
    const productionShell = createShell({
      silent: true,
      parallel: 4,
      timeout: 10000,
      retries: 3,
      fatal: false
    });
    
    console.log('   🏃 Fast Shell (parallel: 8, silent: true):');
    const fastStart = Date.now();
    await fastShell.parallel([
      'echo "fast1"', 'echo "fast2"', 'echo "fast3"', 'echo "fast4"'
    ]);
    console.log(`   ⚡ Completed in ${Date.now() - fastStart}ms\n`);
    
    console.log('   🐛 Debug Shell (verbose: true, parallel: 1):');
    debugShell.on('operationComplete', (details) => {
      console.log(`   📝 Debug: ${details.operation} completed`);
    });
    await debugShell.exec('echo "debug test"');
    console.log();
    
    console.log('   🏭 Production Shell (retries: 3, fault-tolerant):');
    try {
      await productionShell.exec('nonexistent_command_that_will_fail');
    } catch (error) {
      console.log(`   ✅ Production shell handled error gracefully: ${error.message.split(':')[0]}`);
    }
    
    console.log();
    
    // Demo 6: Advanced Error Handling and Recovery
    console.log('🔗 Demo 6: Advanced Error Handling and Recovery');
    console.log('   Testing retry logic and error recovery...\n');
    
    let attemptCount = 0;
    const unreliableOperation = async () => {
      attemptCount++;
      console.log(`   🔄 Attempt ${attemptCount}: Trying unreliable operation...`);
      
      if (attemptCount < 3) {
        throw new Error(`Simulated failure #${attemptCount}`);
      }
      
      console.log('   ✅ Operation succeeded on attempt 3');
      return 'success';
    };
    
    try {
      const result = await shell.copy('/fake/source', '/fake/dest', {
        retry: {
          attempts: 3,
          delay: 200,
          backoff: 2,
          onRetry: (attempt, error) => {
            console.log(`   ⚠️  Retry ${attempt}: ${error.message}`);
          }
        }
      });
    } catch (error) {
      console.log(`   ✅ Retry mechanism demonstrated: ${error.code}`);
    }
    
    console.log();
    
    // Cleanup and Summary
    console.log('🧹 Cleaning up demo environment...');
    await shell.remove(demoDir, { recursive: true, force: true });
    
    console.log('\n🎉 Advanced Pipeline Demo Completed Successfully!');
    console.log('\n📈 Performance Summary:');
    console.log('   • Complex file processing pipelines');
    console.log('   • Real-time log analysis with text processing');
    console.log('   • Build pipeline simulation with progress tracking');
    console.log('   • Controlled parallel processing with concurrency limits');
    console.log('   • Multiple shell configurations for different use cases');
    console.log('   • Advanced error handling with retry logic');
    console.log('\n🌟 @oxog/shell-core demonstrates enterprise-grade shell operations!');
    
  } catch (error) {
    console.error('❌ Advanced demo failed:', error.message);
    
    // Cleanup on error
    try {
      await shell.remove(demoDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Run the advanced demonstration
demonstrateAdvancedPipelines().catch(console.error);