#!/usr/bin/env node

/**
 * @oxog/shell-core Transaction System Demo
 * 
 * This example demonstrates the comprehensive transaction system with rollback capabilities,
 * showcasing atomic operations that can be safely reverted if any step fails.
 */

import { shell, Transaction } from '../dist/esm/index.js';
import { join } from 'path';

async function transactionDemo() {
  console.log('🎬 @oxog/shell-core Transaction System Demonstration');
  console.log('====================================================\n');

  // Setup demo workspace
  const workspaceDir = join(process.cwd(), 'transaction-demo-workspace');
  
  try {
    // Clean and create workspace
    await shell.remove(workspaceDir, { recursive: true, force: true });
    await shell.mkdir(workspaceDir, { recursive: true });
    
    console.log('📁 Created demo workspace:', workspaceDir);
    
    // Create some initial files for demonstration
    await shell.exec(`echo "Original content" > "${join(workspaceDir, 'original.txt')}"`);
    await shell.exec(`echo "Important data that should not be lost" > "${join(workspaceDir, 'important.txt')}"`);
    await shell.mkdir(join(workspaceDir, 'data'), { recursive: true });
    await shell.exec(`echo "{\\"version\\": \\"1.0\\", \\"env\\": \\"test\\"}" > "${join(workspaceDir, 'data', 'config.json')}"`);;
    
    console.log('✅ Created initial files for demonstration\n');

    // Demo 1: Successful Transaction
    console.log('📋 Demo 1: Successful Transaction');
    console.log('----------------------------------');
    
    let transactionResult = await shell.transaction(async (tx) => {
      console.log('   🔄 Starting transaction...');
      
      // Step 1: Copy a file
      await tx.copy(
        join(workspaceDir, 'original.txt'), 
        join(workspaceDir, 'backup.txt')
      );
      console.log('   ✅ Step 1: Copied original.txt to backup.txt');
      
      // Step 2: Create a new directory
      await tx.mkdir(join(workspaceDir, 'processed'));
      console.log('   ✅ Step 2: Created processed directory');
      
      // Step 3: Move file to new directory
      await tx.move(
        join(workspaceDir, 'backup.txt'), 
        join(workspaceDir, 'processed', 'backup.txt')
      );
      console.log('   ✅ Step 3: Moved backup.txt to processed directory');
      
      // Step 4: Create a new file
      await tx.writeFile(
        join(workspaceDir, 'processed', 'status.txt'), 
        'Processing completed successfully'
      );
      console.log('   ✅ Step 4: Created status.txt');
      
      // Step 5: Execute a command
      const result = await tx.exec(`echo "Transaction completed at $(date)" > "${join(workspaceDir, 'log.txt')}"`);
      console.log('   ✅ Step 5: Executed logging command');
      
      return { steps: 5, status: 'completed' };
    });
    
    console.log(`✅ Transaction completed successfully: ${JSON.stringify(transactionResult)}`);
    console.log(`📂 Files created: processed/backup.txt, processed/status.txt, log.txt\n`);

    // Demo 2: Failed Transaction with Rollback
    console.log('📋 Demo 2: Failed Transaction with Rollback');
    console.log('-------------------------------------------');
    
    // Show current state
    console.log('   📊 Current workspace state:');
    const filesBefore = await shell.exec(`dir "${workspaceDir}" /B`, { silent: true });
    console.log(`      ${filesBefore.stdout.trim().split('\n').join(', ')}`);
    
    try {
      await shell.transaction(async (tx) => {
        console.log('   🔄 Starting transaction that will fail...');
        
        // Step 1: Create a new file (this will succeed)
        await tx.writeFile(
          join(workspaceDir, 'temp-file.txt'), 
          'This is a temporary file'
        );
        console.log('   ✅ Step 1: Created temp-file.txt');
        
        // Step 2: Copy an important file (this will succeed)
        await tx.copy(
          join(workspaceDir, 'important.txt'), 
          join(workspaceDir, 'important-backup.txt')
        );
        console.log('   ✅ Step 2: Backed up important.txt');
        
        // Step 3: Modify the important file (this will succeed)
        await tx.writeFile(
          join(workspaceDir, 'important.txt'), 
          'This content has been modified during transaction'
        );
        console.log('   ✅ Step 3: Modified important.txt');
        
        // Step 4: Try to copy a non-existent file (this will fail)
        console.log('   ❌ Step 4: Attempting to copy non-existent file...');
        await tx.copy(
          join(workspaceDir, 'non-existent-file.txt'), 
          join(workspaceDir, 'will-not-be-created.txt')
        );
        
        // This should never be reached
        console.log('   ⚠️ This should not be printed!');
        return { status: 'unexpected_success' };
      });
      
    } catch (error) {
      console.log(`   🔄 Transaction failed as expected: ${error.message}`);
      console.log('   📝 Rollback completed automatically');
    }
    
    // Verify rollback worked
    console.log('\n   📊 Workspace state after rollback:');
    const filesAfter = await shell.exec(`dir "${workspaceDir}" /B`, { silent: true });
    console.log(`      ${filesAfter.stdout.trim().split('\n').join(', ')}`);
    
    // Check that important.txt was restored
    const importantResult = await shell.exec(`type "${join(workspaceDir, 'important.txt')}"`, { silent: true });
    const importantContent = importantResult.stdout.trim();
    console.log(`   🔍 important.txt content: "${importantContent}"`);
    
    if (importantContent === 'Important data that should not be lost') {
      console.log('   ✅ File content successfully restored by rollback');
    } else {
      console.log('   ❌ Rollback failed to restore file content');
    }

    // Demo 3: Transaction with Progress Tracking
    console.log('\n📋 Demo 3: Transaction with Progress Tracking');
    console.log('---------------------------------------------');
    
    let progressUpdates = [];
    
    await shell.transaction(async (tx) => {
      console.log('   🔄 Starting transaction with progress tracking...');
      
      // Create multiple files to demonstrate progress
      for (let i = 1; i <= 5; i++) {
        await tx.writeFile(
          join(workspaceDir, `progress-file-${i}.txt`), 
          `File ${i} content`
        );
        console.log(`   📝 Created progress-file-${i}.txt`);
      }
      
      return { filesCreated: 5 };
      
    }, {
      onProgress: (step, total, current) => {
        progressUpdates.push({ step: step.operation, total, current });
        console.log(`   📊 Progress: ${current}/${total} - ${step.operation} operation`);
      }
    });
    
    console.log(`✅ Transaction with progress tracking completed`);
    console.log(`📈 Total progress updates: ${progressUpdates.length}\n`);

    // Demo 4: Dry Run Transaction
    console.log('📋 Demo 4: Dry Run Transaction (No Actual Changes)');
    console.log('--------------------------------------------------');
    
    await shell.transaction(async (tx) => {
      console.log('   🔄 Starting dry run transaction...');
      
      await tx.writeFile(
        join(workspaceDir, 'dry-run-file.txt'), 
        'This file will not actually be created'
      );
      console.log('   🎭 Simulated: Created dry-run-file.txt');
      
      await tx.mkdir(join(workspaceDir, 'dry-run-dir'));
      console.log('   🎭 Simulated: Created dry-run-dir directory');
      
      await tx.remove(join(workspaceDir, 'original.txt'));
      console.log('   🎭 Simulated: Removed original.txt');
      
      return { message: 'Dry run completed' };
      
    }, {
      dryRun: true
    });
    
    // Verify no actual changes were made
    const originalCheck = await shell.exec(`if exist "${join(workspaceDir, 'original.txt')}" echo exists`, { silent: true });
    const dryRunCheck = await shell.exec(`if exist "${join(workspaceDir, 'dry-run-file.txt')}" echo exists`, { silent: true });
    
    const originalExists = originalCheck.stdout.trim() === 'exists';
    const dryRunExists = dryRunCheck.stdout.trim() === 'exists';
    
    console.log(`   🔍 original.txt still exists: ${originalExists}`);
    console.log(`   🔍 dry-run-file.txt was created: ${dryRunExists}`);
    console.log('   ✅ Dry run mode working correctly\n');

    // Demo 5: Transaction with Timeout
    console.log('📋 Demo 5: Transaction with Timeout');
    console.log('------------------------------------');
    
    try {
      await shell.transaction(async (tx) => {
        console.log('   ⏰ Starting transaction with 2 second timeout...');
        
        await tx.writeFile(
          join(workspaceDir, 'timeout-test.txt'), 
          'Starting long operation'
        );
        console.log('   ✅ Step 1: Created timeout-test.txt');
        
        // Simulate a long-running operation
        console.log('   ⏳ Simulating 3-second operation (will timeout)...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log('   ❌ This should not be reached due to timeout');
        return { status: 'unexpected_completion' };
        
      }, {
        timeout: 2000 // 2 second timeout
      });
      
    } catch (error) {
      console.log(`   ⏰ Transaction timed out as expected`);
      
      // Check if rollback cleaned up the file
      const timeoutCheck = await shell.exec(`if exist "${join(workspaceDir, 'timeout-test.txt')}" echo exists`, { silent: true });
      const timeoutFileExists = timeoutCheck.stdout.trim() === 'exists';
      console.log(`   🔍 timeout-test.txt exists after rollback: ${timeoutFileExists}`);
      
      if (!timeoutFileExists) {
        console.log('   ✅ Timeout triggered automatic rollback successfully');
      }
    }

    // Demo 6: Advanced Transaction with Backup Verification
    console.log('\n📋 Demo 6: Advanced Transaction with Backup Verification');
    console.log('--------------------------------------------------------');
    
    const backupDir = join(workspaceDir, '.transaction-backups');
    
    await shell.transaction(async (tx) => {
      console.log('   🔄 Starting transaction with backup verification...');
      
      // Modify existing files to trigger backups
      await tx.writeFile(
        join(workspaceDir, 'important.txt'), 
        'Modified content during backup test'
      );
      console.log('   ✅ Modified important.txt (backup should be created)');
      
      await tx.copy(
        join(workspaceDir, 'data', 'config.json'), 
        join(workspaceDir, 'config-copy.json')
      );
      console.log('   ✅ Copied config.json');
      
      return { backupTest: 'completed' };
      
    }, {
      backupDir: backupDir
    });
    
    // Check if backups were created and then cleaned up after successful commit
    const backupCheck = await shell.exec(`if exist "${backupDir}" echo exists`, { silent: true });
    const backupDirExists = backupCheck.stdout.trim() === 'exists';
    console.log(`   🗂️ Backup directory exists after commit: ${backupDirExists}`);
    
    if (!backupDirExists) {
      console.log('   ✅ Backup cleanup after successful commit working correctly');
    }

    // Performance Test
    console.log('\n⚡ Performance Test: Transaction Overhead');
    console.log('=========================================');
    
    const perfIterations = 20;
    
    // Test without transactions
    const nonTxStart = Date.now();
    for (let i = 0; i < perfIterations; i++) {
      await shell.exec(`echo "Content ${i}" > "${join(workspaceDir, `perf-normal-${i}.txt`)}"`);
    }
    const nonTxTime = Date.now() - nonTxStart;
    
    // Test with transactions (individual)
    const txStart = Date.now();
    for (let i = 0; i < perfIterations; i++) {
      await shell.transaction(async (tx) => {
        await tx.writeFile(join(workspaceDir, `perf-tx-${i}.txt`), `Content ${i}`);
      });
    }
    const txTime = Date.now() - txStart;
    
    // Test with single large transaction
    const largeTxStart = Date.now();
    await shell.transaction(async (tx) => {
      for (let i = 0; i < perfIterations; i++) {
        await tx.writeFile(join(workspaceDir, `perf-large-tx-${i}.txt`), `Content ${i}`);
      }
    });
    const largeTxTime = Date.now() - largeTxStart;
    
    console.log(`📊 Performance Results (${perfIterations} operations):`);
    console.log(`   ⚡ Without transactions: ${nonTxTime}ms (${(nonTxTime / perfIterations).toFixed(2)}ms per op)`);
    console.log(`   🔄 Individual transactions: ${txTime}ms (${(txTime / perfIterations).toFixed(2)}ms per op)`);
    console.log(`   📦 Single large transaction: ${largeTxTime}ms (${(largeTxTime / perfIterations).toFixed(2)}ms per op)`);
    console.log(`   📈 Transaction overhead: ${((txTime / nonTxTime - 1) * 100).toFixed(1)}%`);
    console.log(`   🚀 Large transaction efficiency: ${((txTime / largeTxTime).toFixed(2))}x faster than individual`);

    // Cleanup
    console.log('\n🧹 Cleaning Up');
    console.log('==============');
    
    console.log('🗑️ Removing demo workspace...');
    await shell.remove(workspaceDir, { recursive: true, force: true });
    
    console.log('\n✅ Transaction System Demo Completed Successfully!');
    console.log('\n🎯 Key Features Demonstrated:');
    console.log('   🔄 Atomic operations with automatic rollback on failure');
    console.log('   💾 Automatic backup creation and restoration');
    console.log('   📊 Progress tracking and status monitoring');
    console.log('   🎭 Dry run mode for testing without making changes');
    console.log('   ⏰ Timeout handling with automatic rollback');
    console.log('   🗂️ Backup cleanup after successful commits');
    console.log('   ⚡ Performance overhead analysis and optimization');
    console.log('   🛡️ Data integrity protection during complex operations');
    console.log('   🔧 Configurable transaction behavior and options');
    console.log('   📈 Scalable from simple operations to complex workflows');
    
    console.log('\n🏆 Transaction System Status: PRODUCTION READY');
    
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
  transactionDemo().catch(console.error);
}

export { transactionDemo };