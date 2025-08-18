import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'path';
import { writeFile, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import {
  isWindows,
  isUnix,
  normalizePath,
  resolvePath,
  validatePath,
  pathExists,
  isReadable,
  isWritable,
  isExecutable,
  getFileInfo,
  parsePath,
  joinPaths,
  getParentDir,
  getBasename,
  getExtension,
  changeExtension,
  ensureTrailingSeparator,
  removeTrailingSeparator,
  isSubpath,
  getRelativePath,
  createPathMatcher,
  formatBytes,
  formatDuration,
  PathCache,
  globalPathCache
} from '../dist/esm/index.js';

const testDir = join(tmpdir(), 'shell-utils-test-' + Date.now());

describe('Utils Module Tests', () => {
  
  test('should detect platform correctly', () => {
    if (process.platform === 'win32') {
      assert.equal(isWindows(), true);
      assert.equal(isUnix(), false);
    } else {
      assert.equal(isWindows(), false);
      assert.equal(isUnix(), true);
    }
  });
  
  test('should normalize paths correctly', () => {
    const testCases = [
      { input: 'path/to/file', expected: 'path/to/file' },
      { input: 'path\\to\\file', expected: 'path/to/file' },
      { input: 'path//to///file', expected: 'path/to/file' },
      { input: 'path\\\\to\\\\\\file', expected: 'path/to/file' },
      { input: './path/to/file', expected: 'path/to/file' },
      { input: 'path/./to/../file', expected: 'path/file' }
    ];
    
    testCases.forEach(({ input, expected }) => {
      const result = normalizePath(input);
      const expectedNormalized = process.platform === 'win32' ? expected.replace(/\//g, '\\') : expected;
      assert.equal(result, expectedNormalized);
    });
  });
  
  test('should resolve paths correctly', () => {
    const absolute = resolvePath('/absolute/path');
    // On Windows, this becomes something like C:\absolute\path
    // On Unix, it remains /absolute/path
    assert.ok(absolute.includes('absolute') && absolute.includes('path'));
    
    const relative = resolvePath('relative/path', '/base');
    assert.ok(relative.includes('relative'));
    
    const withBasePath = resolvePath('../file', '/base/path');
    assert.ok(withBasePath.includes('file'));
  });
  
  test('should validate paths', () => {
    // Valid paths should not throw
    assert.doesNotThrow(() => validatePath('valid/path', 'test'));
    assert.doesNotThrow(() => validatePath('/absolute/path', 'test'));
    assert.doesNotThrow(() => validatePath('C:\\Windows\\path', 'test'));
    
    // Invalid paths should throw
    assert.throws(() => validatePath('', 'test'));
    assert.throws(() => validatePath('   ', 'test'));
    
    // Null bytes should throw
    assert.throws(() => validatePath('path\0with\0nulls', 'test'));
    
    // Control characters should throw
    assert.throws(() => validatePath('path\x01control', 'test'));
    
    // Invalid characters should throw on Windows
    if (isWindows()) {
      assert.throws(() => validatePath('path<with>invalid|chars', 'test'));
      assert.throws(() => validatePath('path"with"quotes', 'test'));
      assert.throws(() => validatePath('path*with*wildcards', 'test'));
    }
  });
  
  test('should check path existence', async () => {
    await mkdir(testDir, { recursive: true });
    const testFile = join(testDir, 'test-exists.txt');
    
    // Non-existent path
    assert.equal(await pathExists(join(testDir, 'nonexistent')), false);
    
    // Create file and test
    await writeFile(testFile, 'test content');
    assert.equal(await pathExists(testFile), true);
    assert.equal(await pathExists(testDir), true);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should check file permissions', async () => {
    await mkdir(testDir, { recursive: true });
    const testFile = join(testDir, 'test-permissions.txt');
    await writeFile(testFile, 'test content');
    
    // Test readable
    assert.equal(await isReadable(testFile), true);
    assert.equal(await isReadable(join(testDir, 'nonexistent')), false);
    
    // Test writable
    assert.equal(await isWritable(testFile), true);
    assert.equal(await isWritable(join(testDir, 'nonexistent')), false);
    
    // Test executable (platform dependent)
    const execResult = await isExecutable(testFile);
    assert.equal(typeof execResult, 'boolean');
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should get file info', async () => {
    await mkdir(testDir, { recursive: true });
    const testFile = join(testDir, 'test-info.txt');
    const testContent = 'test file info content';
    await writeFile(testFile, testContent);
    
    const fileInfo = await getFileInfo(testFile);
    
    assert.equal(fileInfo.path, testFile);
    assert.equal(fileInfo.isFile, true);
    assert.equal(fileInfo.isDirectory, false);
    assert.equal(fileInfo.isSymlink, false);
    assert.equal(fileInfo.size, testContent.length);
    assert.ok(fileInfo.atime instanceof Date);
    assert.ok(fileInfo.mtime instanceof Date);
    assert.ok(fileInfo.ctime instanceof Date);
    assert.equal(typeof fileInfo.mode, 'number');
    
    const dirInfo = await getFileInfo(testDir);
    assert.equal(dirInfo.isFile, false);
    assert.equal(dirInfo.isDirectory, true);
    
    // Test with follow symlinks
    const fileInfoNoFollow = await getFileInfo(testFile, false);
    assert.equal(fileInfoNoFollow.isFile, true);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });
  
  test('should parse paths correctly', () => {
    const testCases = [
      {
        input: '/path/to/file.txt',
        expected: { dir: '/path/to', name: 'file', base: 'file.txt', ext: '.txt', root: '/' }
      },
      {
        input: 'file.txt',
        expected: { dir: '', name: 'file', base: 'file.txt', ext: '.txt', root: '' }
      },
      {
        input: '/path/to/directory/',
        expected: { dir: '/path/to', name: 'directory', base: 'directory', ext: '', root: '/' }
      }
    ];
    
    testCases.forEach(({ input, expected }) => {
      const result = parsePath(input);
      const expectedDir = process.platform === 'win32' ? expected.dir.replace(/\//g, '\\') : expected.dir;
      const expectedRoot = process.platform === 'win32' && expected.root === '/' ? '\\' : expected.root;
      assert.equal(result.dir, expectedDir);
      assert.equal(result.name, expected.name);
      assert.equal(result.base, expected.base);
      assert.equal(result.ext, expected.ext);
      assert.equal(result.root, expectedRoot);
    });
  });
  
  test('should join paths correctly', () => {
    const expected1 = process.platform === 'win32' ? 'path\\to\\file' : 'path/to/file';
    const expected2 = process.platform === 'win32' ? '\\absolute\\path' : '/absolute/path';
    const expected3 = process.platform === 'win32' ? 'path\\to\\file' : 'path/to/file';
    assert.equal(joinPaths('path', 'to', 'file'), expected1);
    assert.equal(joinPaths('/absolute', 'path'), expected2);
    assert.equal(joinPaths('path/', '/to/', 'file'), expected3);
    assert.equal(joinPaths(), '');
    assert.equal(joinPaths('single'), 'single');
  });
  
  test('should get parent directory', () => {
    const expected1 = process.platform === 'win32' ? '\\path\\to' : '/path/to';
    const expected3 = process.platform === 'win32' ? '\\' : '/';
    assert.equal(getParentDir('/path/to/file.txt'), expected1);
    assert.equal(getParentDir('file.txt'), '.');
    assert.equal(getParentDir('/'), expected3);
    assert.equal(getParentDir(''), '.');
  });
  
  test('should get basename', () => {
    assert.equal(getBasename('/path/to/file.txt'), 'file.txt');
    assert.equal(getBasename('/path/to/file.txt', '.txt'), 'file');
    assert.equal(getBasename('file.txt'), 'file.txt');
    assert.equal(getBasename('/path/to/'), 'to');
  });
  
  test('should get file extension', () => {
    assert.equal(getExtension('file.txt'), '.txt');
    assert.equal(getExtension('file.tar.gz'), '.gz');
    assert.equal(getExtension('file'), '');
    assert.equal(getExtension('.hidden'), '');
    assert.equal(getExtension('file.'), '.');
  });
  
  test('should change file extension', () => {
    assert.equal(changeExtension('file.txt', '.md'), 'file.md');
    assert.equal(changeExtension('file', '.txt'), 'file.txt');
    assert.equal(changeExtension('file.old.txt', '.new'), 'file.old.new');
    
    const pathResult = changeExtension('path/to/file.txt', '.md');
    const expectedPath = process.platform === 'win32' ? 'path\\to\\file.md' : 'path/to/file.md';
    assert.equal(pathResult, expectedPath);
  });
  
  test('should handle trailing separators', () => {
    const sep = process.platform === 'win32' ? '\\' : '/';
    assert.equal(ensureTrailingSeparator('path'), `path${sep}`);
    assert.equal(ensureTrailingSeparator(`path${sep}`), `path${sep}`);
    assert.equal(ensureTrailingSeparator(''), sep);
    
    assert.equal(removeTrailingSeparator(`path${sep}`), 'path');
    assert.equal(removeTrailingSeparator('path'), 'path');
    assert.equal(removeTrailingSeparator(sep), '');
  });
  
  test('should check subpaths', () => {
    assert.equal(isSubpath('/parent', '/parent/child'), true);
    assert.equal(isSubpath('/parent/', '/parent/child'), true);
    assert.equal(isSubpath('/parent', '/parent/child/grandchild'), true);
    assert.equal(isSubpath('/parent', '/parent'), false);
    assert.equal(isSubpath('/parent', '/other'), false);
    assert.equal(isSubpath('/parent', '/parentish'), false);
    
    // Relative paths
    assert.equal(isSubpath('parent', 'parent/child'), true);
    assert.equal(isSubpath('parent', 'other'), false);
  });
  
  test('should get relative paths', () => {
    const expected1 = process.platform === 'win32' ? 'to\\file' : 'to/file';
    assert.equal(getRelativePath('/from/path', '/from/path/to/file'), expected1);
    
    const expected2 = process.platform === 'win32' ? '..\\other' : '../other';
    assert.equal(getRelativePath('/from/path', '/from/other'), expected2);
    assert.equal(getRelativePath('/same', '/same'), '');
    
    // Cross-platform compatibility test
    const result = getRelativePath('/from', '/to');
    assert.equal(typeof result, 'string');
  });
  
  test('should create path matchers', () => {
    // Single pattern
    const matcher1 = createPathMatcher('*.txt');
    assert.equal(matcher1('file.txt'), true);
    assert.equal(matcher1('file.md'), false);
    
    // Multiple patterns
    const matcher2 = createPathMatcher(['*.txt', '*.md']);
    assert.equal(matcher2('file.txt'), true);
    assert.equal(matcher2('file.md'), true);
    assert.equal(matcher2('file.js'), false);
    
    // Complex patterns
    const matcher3 = createPathMatcher('src/**/*.js');
    assert.equal(matcher3('src/index.js'), true);
    assert.equal(matcher3('src/lib/utils.js'), true);
    assert.equal(matcher3('test/index.js'), false);
    
    // Empty patterns
    const matcher4 = createPathMatcher([]);
    assert.equal(matcher4('any/path'), false);
  });
  
  test('should format bytes correctly', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(1024), '1.0 KB');
    assert.equal(formatBytes(1536), '1.5 KB');
    assert.equal(formatBytes(1024 * 1024), '1.0 MB');
    assert.equal(formatBytes(1024 * 1024 * 1024), '1.0 GB');
    assert.equal(formatBytes(1024 * 1024 * 1024 * 1024), '1.0 TB');
    assert.equal(formatBytes(1024 * 1024 * 1024 * 1024 * 1024), '1.0 PB');
    
    // Negative values
    assert.equal(formatBytes(-1024), '-1.0 KB');
    
    // Very small values
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(1), '1 B');
  });
  
  test('should format duration correctly', () => {
    assert.equal(formatDuration(0), '0ms');
    assert.equal(formatDuration(500), '500ms');
    assert.equal(formatDuration(1000), '1.0s');
    assert.equal(formatDuration(1500), '1.5s');
    assert.equal(formatDuration(60000), '1.0m');
    assert.equal(formatDuration(90000), '1.5m');
    assert.equal(formatDuration(3600000), '1.0h');
    assert.equal(formatDuration(3900000), '1.1h');
    
    // Edge cases
    assert.equal(formatDuration(999), '999ms');
    assert.equal(formatDuration(59999), '60.0s');
    assert.equal(formatDuration(3599999), '60.0m');
  });
  
  test('should handle PathCache operations', () => {
    const cache = new PathCache();
    
    // Test set and get
    cache.set('key1', 'value1');
    assert.equal(cache.get('key1'), 'value1');
    assert.equal(cache.get('nonexistent'), undefined);
    
    // Test has
    assert.equal(cache.has('key1'), true);
    assert.equal(cache.has('nonexistent'), false);
    
    // Test delete
    cache.delete('key1');
    assert.equal(cache.has('key1'), false);
    
    // Test size
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    assert.equal(cache.size(), 2);
    
    // Test clear
    cache.clear();
    assert.equal(cache.size(), 0);
    
    // Test max size limit
    const smallCache = new PathCache(2);
    smallCache.set('key1', 'value1');
    smallCache.set('key2', 'value2');
    smallCache.set('key3', 'value3'); // Should evict key1
    
    assert.equal(smallCache.has('key1'), false);
    assert.equal(smallCache.has('key2'), true);
    assert.equal(smallCache.has('key3'), true);
    assert.equal(smallCache.size(), 2);
  });
  
  test('should handle global path cache', () => {
    // Test basic operations
    globalPathCache.set('global-key', 'global-value');
    assert.equal(globalPathCache.get('global-key'), 'global-value');
    
    const initialSize = globalPathCache.size();
    globalPathCache.set('another-key', 'another-value');
    assert.equal(globalPathCache.size(), initialSize + 1);
    
    // Test clear
    globalPathCache.clear();
    assert.equal(globalPathCache.size(), 0);
  });
  
  test('should handle path validation edge cases', () => {
    // Test various invalid characters
    const invalidChars = ['\0', '\x01', '\x02', '\x1F'];
    
    invalidChars.forEach(char => {
      assert.throws(() => validatePath(`path${char}test`, 'test'), /Invalid characters/);
    });
    
    // Test Windows-specific invalid characters
    if (isWindows()) {
      const windowsInvalid = ['<', '>', '|', '*', '?', '"'];
      windowsInvalid.forEach(char => {
        assert.throws(() => validatePath(`path${char}test`, 'test'), /Invalid characters/);
      });
      
      // Test reserved names
      const reserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];
      reserved.forEach(name => {
        assert.throws(() => validatePath(name, 'test'), /Reserved name/);
        assert.throws(() => validatePath(`${name}.txt`, 'test'), /Reserved name/);
      });
    }
  });
  
  test('should handle getFileInfo error cases', async () => {
    try {
      await getFileInfo('/definitely/nonexistent/path/file.txt');
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.equal(error.code, 'ENOENT');
    }
  });
  
  test('should handle permission check error cases', async () => {
    // Test with nonexistent files
    assert.equal(await isReadable('/nonexistent/file'), false);
    assert.equal(await isWritable('/nonexistent/file'), false);
    assert.equal(await isExecutable('/nonexistent/file'), false);
  });
  
});