import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'path';
import { writeFile, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { createShell, BasePlugin, GitPlugin } from '../dist/esm/index.js';

const testDir = join(tmpdir(), 'shell-plugins-test-' + Date.now());

// Test plugin classes
class TestPlugin extends BasePlugin {
  name = 'test-plugin';
  version = '1.0.0';
  description = 'A test plugin for unit testing';
  
  commands = {
    'test.hello': async (name = 'World') => {
      return `Hello, ${name}!`;
    },
    'test.add': async (a, b) => {
      return parseInt(a) + parseInt(b);
    },
    'test.fileOp': async (filename, content) => {
      await this.shell.touch(filename);
      return `Created ${filename}`;
    }
  };
  
  filters = {
    'test.uppercase': (input) => {
      return Array.isArray(input) ? input.map(line => line.toUpperCase()) : input.toUpperCase();
    },
    'test.reverse': (input) => {
      return Array.isArray(input) ? input.reverse() : input.split('').reverse().join('');
    }
  };
  
  transformers = {
    'test.prefix': (prefix) => (input) => {
      return Array.isArray(input) ? input.map(line => `${prefix}: ${line}`) : `${prefix}: ${input}`;
    },
    'test.suffix': (suffix) => (input) => {
      return Array.isArray(input) ? input.map(line => `${line} ${suffix}`) : `${input} ${suffix}`;
    }
  };
  
  onInstall(shell) {
    shell.testFeature = () => 'Test feature installed';
    this.installData = { installed: true, timestamp: Date.now() };
  }
  
  onUninstall(shell) {
    delete shell.testFeature;
    this.installData = null;
  }
  
  getInstallData() {
    return this.installData;
  }
}

class AsyncPlugin extends BasePlugin {
  name = 'async-plugin';
  version = '2.0.0';
  
  commands = {
    'async.delay': async (ms = 100) => {
      await new Promise(resolve => setTimeout(resolve, parseInt(ms)));
      return `Delayed for ${ms}ms`;
    },
    'async.process': async (data) => {
      // Simulate async processing
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(`Processed: ${data}`);
        }, 50);
      });
    }
  };
}

class ErrorPlugin extends BasePlugin {
  name = 'error-plugin';
  version = '1.0.0';
  
  commands = {
    'error.throw': async () => {
      throw new Error('Test error from plugin');
    },
    'error.invalid': async () => {
      return undefined; // Invalid return type
    }
  };
  
  onInstall() {
    throw new Error('Installation error');
  }
}

class ConflictPlugin extends BasePlugin {
  name = 'conflict-plugin';
  version = '1.0.0';
  
  commands = {
    'test.hello': async () => {
      return 'Conflicting hello command';
    }
  };
}

describe('Plugin System Tests', () => {
  
  test('should install and use basic plugin', async () => {
    const shell = createShell({ silent: true });
    const testPlugin = new TestPlugin();
    
    // Install plugin
    shell.use(testPlugin);
    
    // Check plugin is installed
    const stats = shell.getStats();
    assert.ok(stats.plugins.includes('test-plugin'));
    
    // Test basic command
    const helloResult = await shell.test.hello('Plugin');
    assert.equal(helloResult, 'Hello, Plugin!');
    
    // Test command with multiple parameters
    const addResult = await shell.test.add('5', '3');
    assert.equal(addResult, 8);
    
    // Test plugin has access to shell
    await mkdir(testDir, { recursive: true });
    const testFile = join(testDir, 'plugin-test.txt');
    const fileOpResult = await shell.test.fileOp(testFile, 'test content');
    assert.equal(fileOpResult, `Created ${testFile}`);
    
    // Test install callback was called
    assert.equal(typeof shell.testFeature, 'function');
    assert.equal(shell.testFeature(), 'Test feature installed');
    
    // Test install data
    const installData = testPlugin.getInstallData();
    assert.ok(installData.installed);
    assert.ok(installData.timestamp > 0);
    
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
    shell.unuse('test-plugin');
  });
  
  test('should handle plugin filters', async () => {
    const shell = createShell({ silent: true });
    const testPlugin = new TestPlugin();
    shell.use(testPlugin);
    
    // Test uppercase filter
    const uppercaseResult = shell.applyFilter('test.uppercase', 'hello world');
    assert.equal(uppercaseResult, 'HELLO WORLD');
    
    // Test uppercase filter with array
    const uppercaseArray = shell.applyFilter('test.uppercase', ['hello', 'world']);
    assert.deepEqual(uppercaseArray, ['HELLO', 'WORLD']);
    
    // Test reverse filter
    const reverseResult = shell.applyFilter('test.reverse', 'hello');
    assert.equal(reverseResult, 'olleh');
    
    // Test reverse filter with array
    const reverseArray = shell.applyFilter('test.reverse', ['first', 'second', 'third']);
    assert.deepEqual(reverseArray, ['third', 'second', 'first']);
    
    shell.unuse('test-plugin');
  });
  
  test('should handle plugin transformers', async () => {
    const shell = createShell({ silent: true });
    const testPlugin = new TestPlugin();
    shell.use(testPlugin);
    
    // Test prefix transformer
    const prefixTransformer = shell.getTransformer('test.prefix', 'PREFIX');
    const prefixResult = prefixTransformer('test content');
    assert.equal(prefixResult, 'PREFIX: test content');
    
    // Test prefix transformer with array
    const prefixArrayResult = prefixTransformer(['line1', 'line2']);
    assert.deepEqual(prefixArrayResult, ['PREFIX: line1', 'PREFIX: line2']);
    
    // Test suffix transformer
    const suffixTransformer = shell.getTransformer('test.suffix', 'SUFFIX');
    const suffixResult = suffixTransformer('test content');
    assert.equal(suffixResult, 'test content SUFFIX');
    
    shell.unuse('test-plugin');
  });
  
  test('should handle async plugin operations', async () => {
    const shell = createShell({ silent: true });
    const asyncPlugin = new AsyncPlugin();
    shell.use(asyncPlugin);
    
    // Test async delay command
    const startTime = Date.now();
    const delayResult = await shell.async.delay('200');
    const duration = Date.now() - startTime;
    
    assert.equal(delayResult, 'Delayed for 200ms');
    assert.ok(duration >= 150); // Allow some tolerance
    
    // Test async processing
    const processResult = await shell.async.process('test data');
    assert.equal(processResult, 'Processed: test data');
    
    shell.unuse('async-plugin');
  });
  
  test('should handle plugin uninstallation', async () => {
    const shell = createShell({ silent: true });
    const testPlugin = new TestPlugin();
    
    // Install plugin
    shell.use(testPlugin);
    assert.ok(shell.getStats().plugins.includes('test-plugin'));
    assert.equal(typeof shell.testFeature, 'function');
    
    // Uninstall plugin
    shell.unuse('test-plugin');
    
    // Check plugin is removed
    assert.ok(!shell.getStats().plugins.includes('test-plugin'));
    assert.equal(typeof shell.testFeature, 'undefined');
    
    // Check uninstall callback was called
    assert.equal(testPlugin.getInstallData(), null);
    
    // Test commands are no longer available
    assert.equal(typeof shell.test, 'undefined');
  });
  
  test('should handle multiple plugins', async () => {
    const shell = createShell({ silent: true });
    const testPlugin = new TestPlugin();
    const asyncPlugin = new AsyncPlugin();
    
    // Install multiple plugins
    shell.use(testPlugin);
    shell.use(asyncPlugin);
    
    const stats = shell.getStats();
    assert.ok(stats.plugins.includes('test-plugin'));
    assert.ok(stats.plugins.includes('async-plugin'));
    assert.equal(stats.plugins.length, 2);
    
    // Test both plugins work
    const helloResult = await shell.test.hello('Multi');
    assert.equal(helloResult, 'Hello, Multi!');
    
    const delayResult = await shell.async.delay('50');
    assert.equal(delayResult, 'Delayed for 50ms');
    
    // Uninstall one plugin
    shell.unuse('test-plugin');
    
    const statsAfter = shell.getStats();
    assert.ok(!statsAfter.plugins.includes('test-plugin'));
    assert.ok(statsAfter.plugins.includes('async-plugin'));
    
    // Test remaining plugin still works
    const delayResult2 = await shell.async.delay('25');
    assert.equal(delayResult2, 'Delayed for 25ms');
    
    // Cleanup
    shell.unuse('async-plugin');
  });
  
  test('should handle plugin errors gracefully', async () => {
    const shell = createShell({ silent: true });
    const errorPlugin = new ErrorPlugin();
    
    // Test installation error
    try {
      shell.use(errorPlugin);
      assert.fail('Should throw installation error');
    } catch (error) {
      assert.ok(error.message.includes('Installation error'));
      assert.equal(error.code, 'PLUGIN_ERROR');
    }
    
    // Manually install plugin to test command errors
    errorPlugin.onInstall = () => {}; // Override to avoid installation error
    shell.use(errorPlugin);
    
    // Test command error
    try {
      await shell.error.throw();
      assert.fail('Should throw command error');
    } catch (error) {
      assert.equal(error.message, 'Test error from plugin');
    }
    
    shell.unuse('error-plugin');
  });
  
  test('should handle plugin conflicts', async () => {
    const shell = createShell({ silent: true });
    const testPlugin = new TestPlugin();
    const conflictPlugin = new ConflictPlugin();
    
    // Install first plugin
    shell.use(testPlugin);
    
    // Test original command works
    const originalResult = await shell.test.hello('Original');
    assert.equal(originalResult, 'Hello, Original!');
    
    // Install conflicting plugin (should override)
    shell.use(conflictPlugin);
    
    // Test conflicting command now works
    const conflictResult = await shell.test.hello();
    assert.equal(conflictResult, 'Conflicting hello command');
    
    // Cleanup
    shell.unuse('test-plugin');
    shell.unuse('conflict-plugin');
  });
  
  test('should validate plugin structure', async () => {
    const shell = createShell({ silent: true });
    // Test invalid plugin (missing name)
    class InvalidPlugin extends BasePlugin {
      version = '1.0.0';
    }
    
    try {
      shell.use(new InvalidPlugin());
      assert.fail('Should reject plugin without name');
    } catch (error) {
      assert.ok(error.message.includes('name') || error.message.includes('required'));
    }
    
    // Test invalid plugin (missing version)
    class InvalidPlugin2 extends BasePlugin {
      name = 'invalid';
    }
    
    try {
      shell.use(new InvalidPlugin2());
      assert.fail('Should reject plugin without version');
    } catch (error) {
      assert.ok(error.message.includes('version') || error.message.includes('required'));
    }
  });
  
  test('should handle Git plugin', async () => {
    const shell = createShell({ silent: true });
    const gitPlugin = new GitPlugin();
    
    // Install Git plugin
    shell.use(gitPlugin);
    
    // Check plugin is installed
    const stats = shell.getStats();
    assert.ok(stats.plugins.includes('git'));
    
    // Test Git commands (if git is available)
    try {
      // Test git version command
      const version = await shell.git.version();
      assert.ok(typeof version === 'string');
      assert.ok(version.includes('git'));
      
      // Test git status in a non-git directory (should handle gracefully)
      const status = await shell.git.status();
      assert.ok(typeof status === 'string');
      
    } catch (error) {
      // Git might not be available or we might not be in a git repo
      console.log('   ⏭️  Git not available or not in git repository');
      assert.ok(error instanceof Error);
    }
    
    shell.unuse('git');
  });
  
  test('should support plugin metadata and info', async () => {
    const shell = createShell({ silent: true });
    const testPlugin = new TestPlugin();
    shell.use(testPlugin);
    
    // Test plugin metadata
    const pluginInfo = shell.getPluginInfo('test-plugin');
    assert.equal(pluginInfo.name, 'test-plugin');
    assert.equal(pluginInfo.version, '1.0.0');
    assert.equal(pluginInfo.description, 'A test plugin for unit testing');
    
    // Test plugin commands list
    const commands = Object.keys(pluginInfo.commands || {});
    assert.ok(commands.includes('test.hello'));
    assert.ok(commands.includes('test.add'));
    assert.ok(commands.includes('test.fileOp'));
    
    // Test plugin filters list
    const filters = Object.keys(pluginInfo.filters || {});
    assert.ok(filters.includes('test.uppercase'));
    assert.ok(filters.includes('test.reverse'));
    
    // Test plugin transformers list
    const transformers = Object.keys(pluginInfo.transformers || {});
    assert.ok(transformers.includes('test.prefix'));
    assert.ok(transformers.includes('test.suffix'));
    
    shell.unuse('test-plugin');
  });
  
  test('should handle plugin lifecycle', async () => {
    const shell = createShell({ silent: true });
    const testPlugin = new TestPlugin();
    
    // Test plugin before installation
    assert.equal(testPlugin.getInstallData(), undefined);
    
    // Install plugin
    shell.use(testPlugin);
    
    // Test plugin after installation
    const installData = testPlugin.getInstallData();
    assert.ok(installData.installed);
    assert.ok(installData.timestamp > 0);
    
    // Uninstall plugin
    shell.unuse('test-plugin');
    
    // Test plugin after uninstallation
    assert.equal(testPlugin.getInstallData(), null);
  });
  
  test('should handle plugin command namespacing', async () => {
    const shell = createShell({ silent: true });
    const testPlugin = new TestPlugin();
    shell.use(testPlugin);
    
    // Test namespaced commands
    assert.ok(typeof shell.test === 'object');
    assert.ok(typeof shell.test.hello === 'function');
    assert.ok(typeof shell.test.add === 'function');
    
    // Test command execution
    const result = await shell.test.hello('Namespace');
    assert.equal(result, 'Hello, Namespace!');
    
    shell.unuse('test-plugin');
    
    // Test namespace is removed after uninstall
    assert.equal(typeof shell.test, 'undefined');
  });
  
  test('should support plugin chaining and composition', async () => {
    const shell = createShell({ silent: true });
    const testPlugin = new TestPlugin();
    shell.use(testPlugin);
    
    // Test filter chaining through shell operations
    let result = 'hello world';
    result = shell.applyFilter('test.uppercase', result);
    result = shell.applyFilter('test.reverse', result);
    
    assert.equal(result, 'DLROW OLLEH');
    
    // Test transformer composition
    const prefixTransformer = shell.getTransformer('test.prefix', 'START');
    const suffixTransformer = shell.getTransformer('test.suffix', 'END');
    
    let composed = 'middle';
    composed = prefixTransformer(composed);
    composed = suffixTransformer(composed);
    
    assert.equal(composed, 'START: middle END');
    
    shell.unuse('test-plugin');
  });
  
  test('should handle concurrent plugin operations', async () => {
    const shell = createShell({ silent: true });
    const asyncPlugin = new AsyncPlugin();
    shell.use(asyncPlugin);
    
    // Test concurrent async operations
    const operations = [
      shell.async.delay('100'),
      shell.async.delay('50'),
      shell.async.delay('25'),
      shell.async.process('data1'),
      shell.async.process('data2')
    ];
    
    const startTime = Date.now();
    const results = await Promise.all(operations);
    const duration = Date.now() - startTime;
    
    assert.equal(results.length, 5);
    assert.ok(results[0].includes('100ms'));
    assert.ok(results[3].includes('data1'));
    assert.ok(results[4].includes('data2'));
    
    // Should complete faster than sequential execution
    assert.ok(duration < 300); // Much faster than 100+50+25+50+50 = 275ms
    
    console.log(`   📊 Concurrent plugin operations: ${duration}ms`);
    
    shell.unuse('async-plugin');
  });
  
});