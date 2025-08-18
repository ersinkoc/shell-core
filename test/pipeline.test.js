import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'path';
import { writeFile, mkdir, rm, readFile, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { createShell } from '../dist/esm/index.js';

const testDir = join(tmpdir(), 'shell-pipeline-test-' + Date.now());
const shell = createShell({ silent: true });

describe('Pipeline System Tests', () => {
  
  test('should create and execute file pipeline', async () => {
    await mkdir(testDir, { recursive: true });
    
    // Create test files
    const files = ['file1.txt', 'file2.txt', 'large.txt'];
    const filePaths = [];
    
    for (const [index, filename] of files.entries()) {
      const content = 'x'.repeat((index + 1) * 100); // Different sizes
      const filePath = join(testDir, filename);
      await writeFile(filePath, content);
      filePaths.push(filePath);
    }
    
    // Create file pipeline
    const pipeline = shell.filePipeline();
    assert.ok(pipeline);
    assert.equal(typeof pipeline.find, 'function');
    assert.equal(typeof pipeline.execute, 'function');
    
    // Test basic pipeline execution
    const results = await pipeline
      .find('*.txt')
      .execute(filePaths);
    
    assert.equal(results.length, 3);
    assert.ok(results.every(file => file.endsWith('.txt')));
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should filter files by size', async () => {
    await mkdir(testDir, { recursive: true });
    
    const files = [
      { name: 'small.txt', content: 'x'.repeat(50) },
      { name: 'medium.txt', content: 'x'.repeat(150) },
      { name: 'large.txt', content: 'x'.repeat(300) }
    ];
    
    const filePaths = [];
    for (const file of files) {
      const filePath = join(testDir, file.name);
      await writeFile(filePath, file.content);
      filePaths.push(filePath);
    }
    
    // Test minimum size filter
    const largeFiles = await shell.filePipeline()
      .filterBySize(200)
      .execute(filePaths);
    
    assert.equal(largeFiles.length, 1);
    assert.ok(largeFiles[0].includes('large.txt'));
    
    // Test size range filter
    const mediumFiles = await shell.filePipeline()
      .filterBySize(100, 200)
      .execute(filePaths);
    
    assert.equal(mediumFiles.length, 1);
    assert.ok(mediumFiles[0].includes('medium.txt'));
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should filter files by type', async () => {
    await mkdir(testDir, { recursive: true });
    
    const files = [
      'document.txt',
      'script.js',
      'stylesheet.css',
      'data.json',
      'readme.md'
    ];
    
    const filePaths = [];
    for (const filename of files) {
      const filePath = join(testDir, filename);
      await writeFile(filePath, 'test content');
      filePaths.push(filePath);
    }
    
    // Test filtering by file type (all should be files)
    const filteredFiles = await shell.filePipeline()
      .filterByType('file')
      .execute(filePaths);
    
    assert.equal(filteredFiles.length, 5);
    assert.ok(filteredFiles[0].includes('.txt') || filteredFiles[0].includes('.js') || filteredFiles[0].includes('.css') || filteredFiles[0].includes('.json') || filteredFiles[0].includes('.md'));
    
    // Create a directory to test directory filtering
    const dirPath = join(testDir, 'subdirectory');
    await mkdir(dirPath);
    const allPaths = [...filePaths, dirPath];
    
    const directories = await shell.filePipeline()
      .filterByType('directory')
      .execute(allPaths);
    
    assert.equal(directories.length, 1);
    assert.ok(directories[0].includes('subdirectory'));
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should filter files by age', async () => {
    await mkdir(testDir, { recursive: true });
    
    const oldFile = join(testDir, 'old.txt');
    const newFile = join(testDir, 'new.txt');
    
    await writeFile(oldFile, 'old content');
    
    // Wait a bit to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await writeFile(newFile, 'new content');
    
    const cutoffTime = new Date();
    cutoffTime.setMilliseconds(cutoffTime.getMilliseconds() - 50);
    
    // Test filtering by age - files newer than cutoff time
    const newerFiles = await shell.filePipeline()
      .filterByAge(undefined, cutoffTime)  // newerThan = cutoffTime
      .execute([oldFile, newFile]);
    
    // Should only include the newer file
    assert.equal(newerFiles.length, 1);
    assert.ok(newerFiles[0].includes('new.txt'));
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should copy files through pipeline', async () => {
    await mkdir(testDir, { recursive: true });
    
    const sourceDir = join(testDir, 'source');
    const destDir = join(testDir, 'dest');
    await mkdir(sourceDir);
    await mkdir(destDir);
    
    const sourceFiles = ['file1.txt', 'file2.txt'];
    const sourcePaths = [];
    
    for (const filename of sourceFiles) {
      const filePath = join(sourceDir, filename);
      await writeFile(filePath, `Content of ${filename}`);
      sourcePaths.push(filePath);
    }
    
    // Copy files through pipeline
    const results = await shell.filePipeline()
      .copyTo(destDir)
      .execute(sourcePaths);
    
    assert.equal(results.length, 2);
    
    // Verify files were copied
    for (const filename of sourceFiles) {
      const destFile = join(destDir, filename);
      const content = await readFile(destFile, 'utf-8');
      assert.equal(content, `Content of ${filename}`);
    }
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should move files through pipeline', async () => {
    await mkdir(testDir, { recursive: true });
    
    const sourceDir = join(testDir, 'source');
    const destDir = join(testDir, 'dest');
    await mkdir(sourceDir);
    await mkdir(destDir);
    
    const sourceFiles = ['move1.txt', 'move2.txt'];
    const sourcePaths = [];
    
    for (const filename of sourceFiles) {
      const filePath = join(sourceDir, filename);
      await writeFile(filePath, `Move content of ${filename}`);
      sourcePaths.push(filePath);
    }
    
    // Move files through pipeline
    const results = await shell.filePipeline()
      .moveTo(destDir)
      .execute(sourcePaths);
    
    assert.equal(results.length, 2);
    
    // Verify files were moved
    for (const filename of sourceFiles) {
      const sourceFile = join(sourceDir, filename);
      const destFile = join(destDir, filename);
      
      // Source should not exist
      try {
        await stat(sourceFile);
        assert.fail('Source file should not exist after move');
      } catch (error) {
        assert.equal(error.code, 'ENOENT');
      }
      
      // Destination should exist
      const content = await readFile(destFile, 'utf-8');
      assert.equal(content, `Move content of ${filename}`);
    }
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should remove files through pipeline', async () => {
    await mkdir(testDir, { recursive: true });
    
    const filesToRemove = ['remove1.txt', 'remove2.txt', 'remove3.txt'];
    const filePaths = [];
    
    for (const filename of filesToRemove) {
      const filePath = join(testDir, filename);
      await writeFile(filePath, 'Content to be removed');
      filePaths.push(filePath);
    }
    
    // Remove files through pipeline
    const results = await shell.filePipeline()
      .remove()
      .execute(filePaths);
    
    assert.equal(results.length, 3);
    
    // Verify files were removed
    for (const filePath of filePaths) {
      try {
        await stat(filePath);
        assert.fail('File should be removed');
      } catch (error) {
        assert.equal(error.code, 'ENOENT');
      }
    }
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should rename files through pipeline', async () => {
    await mkdir(testDir, { recursive: true });
    
    const originalFiles = ['old-name1.txt', 'old-name2.txt'];
    const filePaths = [];
    
    for (const filename of originalFiles) {
      const filePath = join(testDir, filename);
      await writeFile(filePath, `Content of ${filename}`);
      filePaths.push(filePath);
    }
    
    // Rename files through pipeline
    const results = await shell.filePipeline()
      .rename(filename => filename.replace('old-name', 'new-name'))
      .execute(filePaths);
    
    assert.equal(results.length, 2);
    
    // Verify files were renamed
    for (let i = 0; i < originalFiles.length; i++) {
      const originalPath = filePaths[i];
      const newName = originalFiles[i].replace('old-name', 'new-name');
      const newPath = join(testDir, newName);
      
      // Original should not exist
      try {
        await stat(originalPath);
        assert.fail('Original file should not exist after rename');
      } catch (error) {
        assert.equal(error.code, 'ENOENT');
      }
      
      // New file should exist
      const content = await readFile(newPath, 'utf-8');
      assert.equal(content, `Content of ${originalFiles[i]}`);
    }
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should create text pipeline', async () => {
    const inputLines = [
      'first line',
      'second line',
      'THIRD LINE',
      'fourth line',
      'FIFTH LINE'
    ];
    
    // Create text pipeline
    const pipeline = shell.textPipeline();
    assert.ok(pipeline);
    assert.equal(typeof pipeline.grep, 'function');
    assert.equal(typeof pipeline.execute, 'function');
    
    // Test basic text pipeline
    const results = await pipeline.execute(inputLines);
    assert.deepEqual(results, inputLines);
  });
  
  test('should filter text lines through pipeline', async () => {
    const inputLines = [
      'This contains error',
      'This is normal',
      'Another ERROR here',
      'Normal line',
      'Final error message'
    ];
    
    // Filter lines containing 'error' (case insensitive)
    const errorLines = await shell.textPipeline()
      .grep(/error/i)
      .execute(inputLines);
    
    assert.equal(errorLines.length, 3);
    assert.ok(errorLines.every(line => /error/i.test(line)));
  });
  
  test('should transform text through pipeline', async () => {
    const inputLines = [
      'hello world',
      'goodbye world',
      'test message'
    ];
    
    // Transform text through pipeline
    const results = await shell.textPipeline()
      .sed(/world/g, 'universe')
      .execute(inputLines);
    
    assert.equal(results.length, 3);
    assert.ok(results[0].includes('universe'));
    assert.ok(results[1].includes('universe'));
    assert.equal(results[2], 'test message'); // Unchanged
  });
  
  test('should get head and tail through text pipeline', async () => {
    const inputLines = [];
    for (let i = 1; i <= 10; i++) {
      inputLines.push(`Line ${i}`);
    }
    
    // Test head - returns array of arrays, so get first result
    const headResult = await shell.textPipeline()
      .head(3)
      .execute(inputLines);
    
    const headLines = headResult[0]; // First result is the array of lines
    assert.equal(headLines.length, 3);
    assert.equal(headLines[0], 'Line 1');
    assert.equal(headLines[2], 'Line 3');
    
    // Test tail
    const tailResult = await shell.textPipeline()
      .tail(3)
      .execute(inputLines);
    
    const tailLines = tailResult[0]; // First result is the array of lines
    assert.equal(tailLines.length, 3);
    assert.equal(tailLines[0], 'Line 8');
    assert.equal(tailLines[2], 'Line 10');
  });
  
  test('should sort text through pipeline', async () => {
    const inputLines = [
      'zebra',
      'apple',
      'Banana',
      'cherry'
    ];
    
    // Test default sort
    const sortedResult = await shell.textPipeline()
      .sort()
      .execute(inputLines);
    
    const sortedLines = sortedResult[0]; // First result is the array of lines
    assert.equal(sortedLines[0], 'Banana'); // Capital B comes before lowercase
    assert.equal(sortedLines[1], 'apple');
    
    // Test case-insensitive sort
    const caseInsensitiveResult = await shell.textPipeline()
      .sort({ ignoreCase: true })
      .execute(inputLines);
    
    const caseInsensitiveLines = caseInsensitiveResult[0];
    assert.ok(caseInsensitiveLines.indexOf('apple') < caseInsensitiveLines.indexOf('Banana'));
  });
  
  test('should remove duplicate lines through pipeline', async () => {
    const inputLines = [
      'apple',
      'banana',
      'apple',
      'cherry',
      'banana',
      'date'
    ];
    
    // Remove duplicates
    const uniqueResults = await shell.textPipeline()
      .unique()
      .execute(inputLines);
    
    assert.ok(uniqueResults.includes('apple'));
    assert.ok(uniqueResults.includes('banana'));
    assert.ok(uniqueResults.includes('cherry'));
    assert.ok(uniqueResults.includes('date'));
    assert.ok(uniqueResults.length <= inputLines.length);
  });
  
  test('should count lines through pipeline', async () => {
    const inputLines = [
      'line 1',
      'line 2',
      'line 3'
    ];
    
    // Count lines
    const countResult = await shell.textPipeline()
      .count()
      .execute(inputLines);
    
    assert.equal(countResult[0], 3); // First result is the count
  });
  
  test('should join lines through pipeline', async () => {
    const inputLines = [
      'first',
      'second',
      'third'
    ];
    
    // Join with default separator
    const joinedResult = await shell.textPipeline()
      .join()
      .execute(inputLines);
    
    assert.equal(joinedResult[0], 'first\nsecond\nthird'); // First result is the joined string
    
    // Join with custom separator
    const customJoinedResult = await shell.textPipeline()
      .join(', ')
      .execute(inputLines);
    
    assert.equal(customJoinedResult[0], 'first, second, third'); // First result is the joined string
  });
  
  test('should chain multiple pipeline operations', async () => {
    await mkdir(testDir, { recursive: true });
    
    // Create files with different sizes and types
    const files = [
      { name: 'small.txt', content: 'x'.repeat(50) },
      { name: 'medium.js', content: 'x'.repeat(150) },
      { name: 'large.txt', content: 'x'.repeat(300) },
      { name: 'huge.css', content: 'x'.repeat(500) }
    ];
    
    const filePaths = [];
    for (const file of files) {
      const filePath = join(testDir, file.name);
      await writeFile(filePath, file.content);
      filePaths.push(filePath);
    }
    
    const destDir = join(testDir, 'processed');
    await mkdir(destDir);
    
    // Chain multiple operations
    const results = await shell.filePipeline()
      .filterBySize(100) // Files larger than 100 bytes
      .filterByType(['txt', 'js']) // Only txt and js files
      .rename(name => `processed-${name}`) // Add prefix
      .copyTo(destDir) // Copy to destination
      .execute(filePaths);
    
    // Should only process medium.js and large.txt
    assert.equal(results.length, 2);
    
    // Verify processed files exist
    const processedMedium = join(destDir, 'processed-medium.js');
    const processedLarge = join(destDir, 'processed-large.txt');
    
    const mediumContent = await readFile(processedMedium, 'utf-8');
    const largeContent = await readFile(processedLarge, 'utf-8');
    
    assert.equal(mediumContent.length, 150);
    assert.equal(largeContent.length, 300);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should chain text pipeline operations', async () => {
    const inputText = [
      'ERROR: Something went wrong',
      'INFO: Everything is fine',
      'ERROR: Another problem',
      'DEBUG: Debugging info',
      'ERROR: Third error',
      'WARN: Warning message',
      'ERROR: Fourth error'
    ];
    
    // Chain multiple text operations
    const results = await shell.textPipeline()
      .grep(/ERROR/) // Filter error lines
      .head(3) // Take first 3 errors
      .sed(/ERROR: /, '') // Remove ERROR prefix
      .sort() // Sort alphabetically
      .execute(inputText);
    
    assert.equal(results.length, 3);
    assert.ok(results.every(line => !line.includes('ERROR:')));
    assert.ok(results.every(line => line.length > 0));
  });
  
  test('should handle pipeline with progress tracking', async () => {
    await mkdir(testDir, { recursive: true });
    
    const files = [];
    const filePaths = [];
    
    // Create 10 test files
    for (let i = 1; i <= 10; i++) {
      const filename = `progress-${i}.txt`;
      const filePath = join(testDir, filename);
      await writeFile(filePath, `Content ${i}`);
      filePaths.push(filePath);
    }
    
    let progressCalls = 0;
    const progressCallback = (current, total) => {
      progressCalls++;
      assert.ok(current <= total);
      assert.ok(current >= 0);
    };
    
    // Execute with progress tracking
    const results = await shell.filePipeline()
      .progress(progressCallback)
      .execute(filePaths);
    
    assert.equal(results.length, 10);
    assert.ok(progressCalls > 0);
    
    console.log(`   📊 Progress callbacks: ${progressCalls}`);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle parallel pipeline execution', async () => {
    await mkdir(testDir, { recursive: true });
    
    const files = [];
    const filePaths = [];
    
    // Create test files
    for (let i = 1; i <= 8; i++) {
      const filename = `parallel-${i}.txt`;
      const filePath = join(testDir, filename);
      await writeFile(filePath, `Parallel content ${i}`);
      filePaths.push(filePath);
    }
    
    const destDir = join(testDir, 'parallel-dest');
    await mkdir(destDir);
    
    // Execute with parallel processing
    const startTime = Date.now();
    const results = await shell.filePipeline()
      .parallel(4) // Process 4 files at a time
      .copyTo(destDir)
      .execute(filePaths);
    const duration = Date.now() - startTime;
    
    assert.equal(results.length, 8);
    
    // Verify all files were copied
    for (let i = 1; i <= 8; i++) {
      const destFile = join(destDir, `parallel-${i}.txt`);
      const content = await readFile(destFile, 'utf-8');
      assert.equal(content, `Parallel content ${i}`);
    }
    
    console.log(`   📊 Parallel pipeline (8 files, concurrency 4): ${duration}ms`);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle pipeline error cases', async () => {
    await mkdir(testDir, { recursive: true });
    
    const validFile = join(testDir, 'valid.txt');
    const invalidFile = join(testDir, 'nonexistent.txt');
    
    await writeFile(validFile, 'valid content');
    
    // Test pipeline with non-existent file
    try {
      await shell.filePipeline()
        .copyTo(testDir)
        .execute([validFile, invalidFile]);
      assert.fail('Should throw error for non-existent file');
    } catch (error) {
      assert.ok(error.code === 'ENOENT' || error.message.includes('ENOENT'));
    }
    
    // Test invalid filter parameters
    try {
      await shell.filePipeline()
        .filterBySize(-1)
        .execute([validFile]);
      assert.fail('Should throw error for negative size');
    } catch (error) {
      assert.ok(error.message.includes('size') || error.message.includes('positive'));
    }
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should handle empty pipeline inputs', async () => {
    // Test file pipeline with empty input
    const fileResults = await shell.filePipeline()
      .filterBySize(100)
      .execute([]);
    
    assert.equal(fileResults.length, 0);
    
    // Test text pipeline with empty input
    const textResults = await shell.textPipeline()
      .grep(/test/)
      .execute([]);
    
    assert.equal(textResults.length, 0);
  });
  
  test('should support custom transformations in pipeline', async () => {
    await mkdir(testDir, { recursive: true });
    
    const files = ['transform1.txt', 'transform2.txt'];
    const filePaths = [];
    
    for (const filename of files) {
      const filePath = join(testDir, filename);
      await writeFile(filePath, `Original ${filename}`);
      filePaths.push(filePath);
    }
    
    // Custom transformation function
    const customTransform = async (filePath) => {
      const content = await readFile(filePath, 'utf-8');
      return `Transformed: ${content}`;
    };
    
    // Apply custom transformation
    const results = await shell.filePipeline()
      .transform(customTransform)
      .execute(filePaths);
    
    assert.equal(results.length, 2);
    assert.ok(results[0].includes('Transformed: Original transform1.txt'));
    assert.ok(results[1].includes('Transformed: Original transform2.txt'));
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
});