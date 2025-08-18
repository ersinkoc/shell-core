import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { 
  ShellError, 
  OperationCancelledError, 
  isRecoverableError, 
  withRetry, 
  createDefaultRetryOptions 
} from '../dist/esm/index.js';

describe('Error System Tests', () => {
  
  test('should create ShellError with all properties', () => {
    const error = new ShellError(
      'Test error message',
      'ENOENT',
      'test-operation',
      '/test/path',
      'test-syscall',
      -4058,
      { extra: 'details' },
      true
    );
    
    assert.equal(error.message, 'Test error message');
    assert.equal(error.code, 'ENOENT');
    assert.equal(error.operation, 'test-operation');
    assert.equal(error.path, '/test/path');
    assert.equal(error.syscall, 'test-syscall');
    assert.equal(error.errno, -4058);
    assert.deepEqual(error.details, { extra: 'details' });
    assert.equal(error.recoverable, true);
    assert.ok(error.timestamp instanceof Date);
    assert.equal(error.name, 'ShellError');
  });
  
  test('should create ShellError with minimal properties', () => {
    const error = new ShellError('Simple error', 'INVALID_OPERATION', 'test');
    
    assert.equal(error.message, 'Simple error');
    assert.equal(error.code, 'INVALID_OPERATION');
    assert.equal(error.operation, 'test');
    assert.equal(error.recoverable, false);
    assert.equal(error.path, undefined);
    assert.equal(error.syscall, undefined);
    assert.equal(error.errno, undefined);
    assert.equal(error.details, undefined);
  });
  
  test('should create ShellError from Node.js error', () => {
    const nodeError = new Error('ENOENT: no such file or directory');
    nodeError.code = 'ENOENT';
    nodeError.errno = -4058;
    nodeError.syscall = 'stat';
    nodeError.path = '/test/path';
    
    const shellError = ShellError.fromNodeError(nodeError, 'test-operation');
    
    assert.ok(shellError instanceof ShellError);
    assert.equal(shellError.code, 'ENOENT');
    assert.equal(shellError.operation, 'test-operation');
    assert.equal(shellError.path, '/test/path');
    assert.equal(shellError.syscall, 'stat');
    assert.equal(shellError.errno, -4058);
  });
  
  test('should serialize ShellError to JSON', () => {
    const error = new ShellError(
      'Test error',
      'EACCES',
      'copy',
      '/test/file',
      'open',
      -13,
      { attempt: 1 },
      true
    );
    
    const json = error.toJSON();
    
    assert.equal(json.name, 'ShellError');
    assert.equal(json.message, 'Test error');
    assert.equal(json.code, 'EACCES');
    assert.equal(json.operation, 'copy');
    assert.equal(json.path, '/test/file');
    assert.equal(json.syscall, 'open');
    assert.equal(json.errno, -13);
    assert.deepEqual(json.details, { attempt: 1 });
    assert.equal(json.recoverable, true);
    assert.ok(json.timestamp);
  });
  
  test('should create OperationCancelledError', () => {
    const error = new OperationCancelledError('test-operation', '/test/path');
    
    assert.ok(error instanceof ShellError);
    assert.equal(error.message, "Operation 'test-operation' was cancelled");
    assert.equal(error.code, 'CANCELLED');
    assert.equal(error.operation, 'test-operation');
    assert.equal(error.path, '/test/path');
    assert.equal(error.recoverable, false);
  });
  
  test('should identify recoverable errors', () => {
    // Test with error codes directly
    assert.equal(isRecoverableError('EBUSY'), true);
    assert.equal(isRecoverableError('EMFILE'), true);
    assert.equal(isRecoverableError('ENOENT'), false);
    assert.equal(isRecoverableError('EACCES'), false);
    assert.equal(isRecoverableError('NETWORK_ERROR'), true);
    assert.equal(isRecoverableError('TIMEOUT'), true);
  });
  
  test('should create default retry options', () => {
    const options = createDefaultRetryOptions();
    
    assert.equal(options.attempts, 3);
    assert.equal(options.delay, 1000);
    assert.equal(options.backoff, 2);
    assert.equal(typeof options.shouldRetry, 'function');
    assert.equal(typeof options.onRetry, 'function');
  });
  
  test('should retry operations with default options', async () => {
    let attempts = 0;
    const testOperation = async () => {
      attempts++;
      if (attempts < 3) {
        const error = new ShellError('Retry test', 'EBUSY', 'test', undefined, undefined, undefined, undefined, true);
        throw error;
      }
      return 'success';
    };
    
    const options = createDefaultRetryOptions();
    const result = await withRetry(testOperation, options, 'test-operation');
    
    assert.equal(result, 'success');
    assert.equal(attempts, 3);
  });
  
  test('should retry operations with custom options', async () => {
    let attempts = 0;
    const retryLog = [];
    
    const testOperation = async () => {
      attempts++;
      if (attempts < 2) {
        const error = new ShellError('Custom retry test', 'EMFILE', 'test', undefined, undefined, undefined, undefined, true);
        throw error;
      }
      return 'custom success';
    };
    
    const customOptions = {
      attempts: 5,
      delay: 100,
      backoff: 1.5,
      shouldRetry: (error) => error instanceof ShellError && error.recoverable,
      onRetry: (attempt, error) => {
        retryLog.push({ attempt, errorCode: error.code });
      }
    };
    
    const result = await withRetry(testOperation, customOptions, 'custom-test');
    
    assert.equal(result, 'custom success');
    assert.equal(attempts, 2);
    assert.equal(retryLog.length, 1);
    assert.equal(retryLog[0].attempt, 1);
    assert.equal(retryLog[0].errorCode, 'EMFILE');
  });
  
  test('should fail after max retry attempts', async () => {
    let attempts = 0;
    const testOperation = async () => {
      attempts++;
      const error = new ShellError('Always fails', 'EACCES', 'test', undefined, undefined, undefined, undefined, true);
      throw error;
    };
    
    const options = {
      attempts: 2,
      delay: 10,
      backoff: 1,
      shouldRetry: () => true,
      onRetry: () => {}
    };
    
    try {
      await withRetry(testOperation, options, 'fail-test');
      assert.fail('Should have thrown after max attempts');
    } catch (error) {
      assert.ok(error instanceof ShellError);
      assert.equal(error.code, 'EACCES');
      assert.equal(attempts, 2);
    }
  });
  
  test('should not retry non-recoverable errors', async () => {
    let attempts = 0;
    const testOperation = async () => {
      attempts++;
      const error = new ShellError('Non-recoverable', 'ENOENT', 'test', undefined, undefined, undefined, undefined, false);
      throw error;
    };
    
    try {
      const defaultOptions = createDefaultRetryOptions();
      await withRetry(testOperation, defaultOptions, 'non-recoverable-test');
      assert.fail('Should have thrown immediately');
    } catch (error) {
      assert.ok(error instanceof ShellError);
      assert.equal(error.code, 'ENOENT');
      assert.equal(attempts, 1);
    }
  });
  
  test('should handle non-ShellError exceptions', async () => {
    let attempts = 0;
    const testOperation = async () => {
      attempts++;
      throw new Error('Regular error');
    };
    
    try {
      const defaultOptions = createDefaultRetryOptions();
      await withRetry(testOperation, defaultOptions, 'regular-error-test');
      assert.fail('Should have thrown immediately');
    } catch (error) {
      assert.ok(error instanceof ShellError); // withRetry converts to ShellError
      assert.equal(error.message, 'Regular error');
      assert.equal(attempts, 1);
    }
  });
  
  test('should respect shouldRetry function', async () => {
    let attempts = 0;
    const testOperation = async () => {
      attempts++;
      const error = new ShellError('Test', 'EBUSY', 'test', undefined, undefined, undefined, undefined, true);
      throw error;
    };
    
    const options = {
      attempts: 5,
      delay: 10,
      backoff: 1,
      shouldRetry: () => false, // Never retry
      onRetry: () => {}
    };
    
    try {
      await withRetry(testOperation, options, 'should-retry-test');
      assert.fail('Should have thrown immediately');
    } catch (error) {
      assert.ok(error instanceof ShellError);
      assert.equal(attempts, 1);
    }
  });
  
  test('should handle errors in onRetry callback', async () => {
    let attempts = 0;
    const testOperation = async () => {
      attempts++;
      if (attempts < 2) {
        const error = new ShellError('Test', 'EBUSY', 'test', undefined, undefined, undefined, undefined, true);
        throw error;
      }
      return 'success';
    };
    
    const options = {
      attempts: 3,
      delay: 10,
      backoff: 1,
      shouldRetry: () => true,
      onRetry: () => {
        throw new Error('Callback error');
      }
    };
    
    // Should still succeed despite callback error
    const result = await withRetry(testOperation, options, 'callback-error-test');
    assert.equal(result, 'success');
    assert.equal(attempts, 2);
  });
  
});