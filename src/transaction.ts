/**
 * Transaction module for @oxog/shell-core
 * Provides atomic operations with rollback capabilities
 */

import { EventEmitter } from 'events';
import { readdir, stat, readFile, writeFile } from 'fs/promises';
import { join, dirname, relative, basename } from 'path';
import type { 
  ShellConfig, 
  CopyOptions, 
  MoveOptions, 
  RemoveOptions, 
  MkdirOptions, 
  TouchOptions,
  CommandResult,
  ExecOptions,
  SpawnOptions
} from './types.js';
import { ShellError } from './errors.js';
import { pathExists, getFileInfo } from './utils.js';

/**
 * Transaction operation types
 */
export type TransactionOperation = 
  | 'copy'
  | 'move' 
  | 'remove'
  | 'mkdir'
  | 'touch'
  | 'exec'
  | 'spawn'
  | 'write'
  | 'backup';

/**
 * Transaction step representing a single operation
 */
export interface TransactionStep {
  readonly id: string;
  readonly operation: TransactionOperation;
  readonly source?: string;
  readonly dest?: string;
  readonly content?: string;
  readonly options?: any;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly timestamp: Date;
  readonly checksum?: string;
}

/**
 * Transaction rollback step for undoing operations
 */
export interface RollbackStep {
  readonly stepId: string;
  readonly operation: TransactionOperation;
  readonly source?: string;
  readonly dest?: string;
  readonly content?: string;
  readonly originalContent?: string;
  readonly originalStats?: any;
  readonly backupPath?: string;
  readonly timestamp: Date;
}

/**
 * Transaction state
 */
export type TransactionState = 'pending' | 'running' | 'committed' | 'rolled_back' | 'failed' | 'timedout';

/**
 * Transaction options
 */
export interface TransactionOptions {
  readonly autoCommit?: boolean;
  readonly backupDir?: string;
  readonly maxRetries?: number;
  readonly timeout?: number;
  readonly dryRun?: boolean;
  readonly onProgress?: (step: TransactionStep, total: number, current: number) => void;
  readonly onRollback?: (step: RollbackStep) => void;
}

/**
 * Transaction result
 */
export interface TransactionResult<T = any> {
  readonly id: string;
  readonly state: TransactionState;
  readonly result?: T;
  readonly steps: readonly TransactionStep[];
  readonly rollbackSteps: readonly RollbackStep[];
  readonly error?: Error;
  readonly duration: number;
  readonly startTime: Date;
  readonly endTime?: Date;
}

/**
 * Interface for transactional shell operations
 */
export interface TransactionalShell {
  copy(source: string, dest: string, options?: CopyOptions): Promise<void>;
  move(source: string, dest: string, options?: MoveOptions): Promise<void>;
  remove(path: string, options?: RemoveOptions): Promise<void>;
  mkdir(path: string, options?: MkdirOptions): Promise<void>;
  touch(path: string, options?: TouchOptions): Promise<void>;
  exec(command: string, options?: ExecOptions): Promise<CommandResult>;
  spawn(command: string, args?: readonly string[], options?: SpawnOptions): Promise<CommandResult>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  getSteps(): readonly TransactionStep[];
  getState(): TransactionState;
}

/**
 * Transaction implementation with rollback capabilities
 */
export class Transaction extends EventEmitter implements TransactionalShell {
  private readonly id: string;
  private state: TransactionState = 'pending';
  private steps: TransactionStep[] = [];
  private rollbackSteps: RollbackStep[] = [];
  private startTime: Date;
  private endTime?: Date;
  private backupCounter = 0;
  
  constructor(
    private shell: any, // The main shell instance
    private options: TransactionOptions = {}
  ) {
    super();
    this.id = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.startTime = new Date();
    
    this.options = {
      autoCommit: false,
      backupDir: '.shell-transaction-backups',
      maxRetries: 3,
      timeout: 30000,
      dryRun: false,
      ...options
    };
    
    if (this.options.timeout) {
      setTimeout(() => {
        if (this.state === 'running') {
          this.handleTimeout();
        }
      }, this.options.timeout);
    }
  }
  
  private async handleTimeout(): Promise<void> {
    this.emit('timeout', this.id);
    this.state = 'timedout';
    await this.rollback();
  }
  
  private generateStepId(): string {
    return `step_${this.steps.length + 1}_${Date.now()}`;
  }
  
  private async createBackup(filePath: string): Promise<string> {
    const backupDir = this.options.backupDir!;
    const backupName = `backup_${this.backupCounter++}_${Date.now()}_${basename(filePath)}`;
    const backupPath = join(backupDir, this.id, backupName);
    
    // Ensure backup directory exists
    await this.shell.mkdir(dirname(backupPath), { recursive: true });
    
    // Copy original file to backup location
    if (await pathExists(filePath)) {
      await this.shell.copy(filePath, backupPath);
    }
    
    return backupPath;
  }
  
  private async calculateChecksum(filePath: string): Promise<string | undefined> {
    try {
      if (await pathExists(filePath)) {
        const fileInfo = await getFileInfo(filePath);
        if (fileInfo.isFile) {
          const content = await readFile(filePath);
          const crypto = await import('crypto');
          return crypto.createHash('md5').update(content).digest('hex');
        }
      }
    } catch {
      // Ignore errors for checksum calculation
    }
    return undefined;
  }
  
  private updateProgress(): void {
    if (this.options.onProgress) {
      const currentStep = this.steps[this.steps.length - 1];
      this.options.onProgress(currentStep, this.steps.length, this.steps.length);
    }
  }
  
  // Transactional operations
  
  public async copy(source: string, dest: string, options: CopyOptions = {}): Promise<void> {
    if (this.state !== 'pending' && this.state !== 'running') {
      throw new ShellError(
        'Cannot perform operations on non-active transaction',
        'INVALID_OPERATION',
        'transaction.copy',
        undefined,
        undefined,
        undefined,
        { state: this.state },
        false
      );
    }
    
    this.state = 'running';
    const stepId = this.generateStepId();
    
    // Create backup if destination exists
    let backupPath: string | undefined;
    if (await pathExists(dest)) {
      backupPath = await this.createBackup(dest);
    }
    
    const step: TransactionStep = {
      id: stepId,
      operation: 'copy',
      source,
      dest,
      options,
      timestamp: new Date(),
      checksum: await this.calculateChecksum(source)
    };
    
    if (this.options.dryRun) {
      this.steps.push(step);
      this.emit('step', step);
      return;
    }
    
    try {
      await this.shell.copy(source, dest, { ...options, __internal: true });
      
      // Create rollback step
      const rollbackStep: RollbackStep = {
        stepId,
        operation: 'remove',
        dest,
        backupPath,
        timestamp: new Date()
      };
      
      this.steps.push(step);
      this.rollbackSteps.unshift(rollbackStep); // Add to beginning for reverse order
      
      this.emit('step', step);
      this.updateProgress();
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  
  public async move(source: string, dest: string, options: MoveOptions = {}): Promise<void> {
    if (this.state !== 'pending' && this.state !== 'running') {
      throw new ShellError(
        'Cannot perform operations on non-active transaction',
        'INVALID_OPERATION',
        'transaction.move',
        undefined,
        undefined,
        undefined,
        { state: this.state },
        false
      );
    }
    
    this.state = 'running';
    const stepId = this.generateStepId();
    
    // Create backup of source and destination
    const sourceBackup = await this.createBackup(source);
    let destBackup: string | undefined;
    if (await pathExists(dest)) {
      destBackup = await this.createBackup(dest);
    }
    
    const step: TransactionStep = {
      id: stepId,
      operation: 'move',
      source,
      dest,
      options,
      timestamp: new Date(),
      checksum: await this.calculateChecksum(source)
    };
    
    if (this.options.dryRun) {
      this.steps.push(step);
      this.emit('step', step);
      return;
    }
    
    try {
      await this.shell.move(source, dest, { ...options, __internal: true });
      
      // Create rollback step
      const rollbackStep: RollbackStep = {
        stepId,
        operation: 'move',
        source: dest,
        dest: source,
        backupPath: sourceBackup,
        timestamp: new Date()
      };
      
      this.steps.push(step);
      this.rollbackSteps.unshift(rollbackStep);
      
      this.emit('step', step);
      this.updateProgress();
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  
  public async remove(path: string, options: RemoveOptions = {}): Promise<void> {
    if (this.state !== 'pending' && this.state !== 'running') {
      throw new ShellError(
        'Cannot perform operations on non-active transaction',
        'INVALID_OPERATION',
        'transaction.remove',
        undefined,
        undefined,
        undefined,
        { state: this.state },
        false
      );
    }
    
    this.state = 'running';
    const stepId = this.generateStepId();
    
    // Create backup before removal
    const backupPath = await this.createBackup(path);
    const originalStats = await pathExists(path) ? await stat(path) : undefined;
    
    const step: TransactionStep = {
      id: stepId,
      operation: 'remove',
      source: path,
      options,
      timestamp: new Date(),
      checksum: await this.calculateChecksum(path)
    };
    
    if (this.options.dryRun) {
      this.steps.push(step);
      this.emit('step', step);
      return;
    }
    
    try {
      await this.shell.remove(path, { ...options, __internal: true });
      
      // Create rollback step to restore from backup
      const rollbackStep: RollbackStep = {
        stepId,
        operation: 'copy',
        source: backupPath,
        dest: path,
        originalStats,
        timestamp: new Date()
      };
      
      this.steps.push(step);
      this.rollbackSteps.unshift(rollbackStep);
      
      this.emit('step', step);
      this.updateProgress();
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  
  public async mkdir(path: string, options: MkdirOptions = {}): Promise<void> {
    if (this.state !== 'pending' && this.state !== 'running') {
      throw new ShellError(
        'Cannot perform operations on non-active transaction',
        'INVALID_OPERATION',
        'transaction.mkdir',
        undefined,
        undefined,
        undefined,
        { state: this.state },
        false
      );
    }
    
    this.state = 'running';
    const stepId = this.generateStepId();
    
    const step: TransactionStep = {
      id: stepId,
      operation: 'mkdir',
      dest: path,
      options,
      timestamp: new Date()
    };
    
    if (this.options.dryRun) {
      this.steps.push(step);
      this.emit('step', step);
      return;
    }
    
    try {
      await this.shell.mkdir(path, { ...options, __internal: true });
      
      // Create rollback step to remove directory
      const rollbackStep: RollbackStep = {
        stepId,
        operation: 'remove',
        dest: path,
        timestamp: new Date()
      };
      
      this.steps.push(step);
      this.rollbackSteps.unshift(rollbackStep);
      
      this.emit('step', step);
      this.updateProgress();
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  
  public async touch(path: string, options: TouchOptions = {}): Promise<void> {
    if (this.state !== 'pending' && this.state !== 'running') {
      throw new ShellError(
        'Cannot perform operations on non-active transaction',
        'INVALID_OPERATION',
        'transaction.touch',
        undefined,
        undefined,
        undefined,
        { state: this.state },
        false
      );
    }
    
    this.state = 'running';
    const stepId = this.generateStepId();
    
    // Backup if file exists
    let backupPath: string | undefined;
    const existedBefore = await pathExists(path);
    if (existedBefore) {
      backupPath = await this.createBackup(path);
    }
    
    const step: TransactionStep = {
      id: stepId,
      operation: 'touch',
      dest: path,
      options,
      timestamp: new Date()
    };
    
    if (this.options.dryRun) {
      this.steps.push(step);
      this.emit('step', step);
      return;
    }
    
    try {
      await this.shell.touch(path, { ...options, __internal: true });
      
      // Create rollback step
      const rollbackStep: RollbackStep = existedBefore ? {
        stepId,
        operation: 'copy',
        source: backupPath!,
        dest: path,
        timestamp: new Date()
      } : {
        stepId,
        operation: 'remove',
        dest: path,
        timestamp: new Date()
      };
      
      this.steps.push(step);
      this.rollbackSteps.unshift(rollbackStep);
      
      this.emit('step', step);
      this.updateProgress();
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  
  public async exec(command: string, options: ExecOptions = {}): Promise<CommandResult> {
    if (this.state !== 'pending' && this.state !== 'running') {
      throw new ShellError(
        'Cannot perform operations on non-active transaction',
        'INVALID_OPERATION',
        'transaction.exec',
        undefined,
        undefined,
        undefined,
        { state: this.state },
        false
      );
    }
    
    this.state = 'running';
    const stepId = this.generateStepId();
    
    const step: TransactionStep = {
      id: stepId,
      operation: 'exec',
      command,
      options,
      timestamp: new Date()
    };
    
    if (this.options.dryRun) {
      this.steps.push(step);
      this.emit('step', step);
      return {
        stdout: '[DRY RUN]',
        stderr: '',
        code: 0,
        signal: null,
        success: true,
        duration: 0
      };
    }
    
    try {
      const result = await this.shell.exec(command, { ...options, __internal: true });
      
      // Note: Command execution cannot be rolled back
      // We just record it for audit purposes
      this.steps.push(step);
      
      this.emit('step', step);
      this.updateProgress();
      
      return result;
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  
  public async spawn(command: string, args: readonly string[] = [], options: SpawnOptions = {}): Promise<CommandResult> {
    if (this.state !== 'pending' && this.state !== 'running') {
      throw new ShellError(
        'Cannot perform operations on non-active transaction',
        'INVALID_OPERATION',
        'transaction.spawn',
        undefined,
        undefined,
        undefined,
        { state: this.state },
        false
      );
    }
    
    this.state = 'running';
    const stepId = this.generateStepId();
    
    const step: TransactionStep = {
      id: stepId,
      operation: 'spawn',
      command,
      args,
      options,
      timestamp: new Date()
    };
    
    if (this.options.dryRun) {
      this.steps.push(step);
      this.emit('step', step);
      return {
        stdout: '[DRY RUN]',
        stderr: '',
        code: 0,
        signal: null,
        success: true,
        duration: 0
      };
    }
    
    try {
      const result = await this.shell.spawn(command, args, { ...options, __internal: true });
      
      // Note: Command execution cannot be rolled back
      this.steps.push(step);
      
      this.emit('step', step);
      this.updateProgress();
      
      return result;
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  
  public async writeFile(path: string, content: string): Promise<void> {
    if (this.state !== 'pending' && this.state !== 'running') {
      throw new ShellError(
        'Cannot perform operations on non-active transaction',
        'INVALID_OPERATION',
        'transaction.writeFile',
        undefined,
        undefined,
        undefined,
        { state: this.state },
        false
      );
    }
    
    this.state = 'running';
    const stepId = this.generateStepId();
    
    // Backup original content if file exists
    let originalContent: string | undefined;
    let backupPath: string | undefined;
    if (await pathExists(path)) {
      originalContent = await readFile(path, 'utf-8');
      backupPath = await this.createBackup(path);
    }
    
    const step: TransactionStep = {
      id: stepId,
      operation: 'write',
      dest: path,
      content,
      timestamp: new Date()
    };
    
    if (this.options.dryRun) {
      this.steps.push(step);
      this.emit('step', step);
      return;
    }
    
    try {
      await writeFile(path, content, 'utf-8');
      
      // Create rollback step
      const rollbackStep: RollbackStep = originalContent !== undefined ? {
        stepId,
        operation: 'write',
        dest: path,
        originalContent,
        timestamp: new Date()
      } : {
        stepId,
        operation: 'remove',
        dest: path,
        timestamp: new Date()
      };
      
      this.steps.push(step);
      this.rollbackSteps.unshift(rollbackStep);
      
      this.emit('step', step);
      this.updateProgress();
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  
  public async readFile(path: string): Promise<string> {
    return await readFile(path, 'utf-8');
  }
  
  public async commit(): Promise<void> {
    if (this.state === 'timedout') {
      throw ShellError.timeout('transaction', this.options.timeout || 0);
    }
    
    if (this.state !== 'running' && this.state !== 'pending') {
      throw new ShellError(
        'Cannot commit transaction in current state',
        'INVALID_OPERATION',
        'transaction.commit',
        undefined,
        undefined,
        undefined,
        { state: this.state },
        false
      );
    }
    
    this.state = 'committed';
    this.endTime = new Date();
    
    // Clean up backup directory if commit is successful
    if (this.options.backupDir) {
      try {
        const backupPath = join(this.options.backupDir, this.id);
        if (await pathExists(backupPath)) {
          await this.shell.remove(backupPath, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    }
    
    this.emit('committed', this.getResult());
  }
  
  public async rollback(): Promise<void> {
    if (this.state === 'rolled_back') {
      return; // Already rolled back
    }
    
    if (this.state === 'committed') {
      throw new ShellError(
        'Cannot rollback committed transaction',
        'INVALID_OPERATION',
        'transaction.rollback',
        undefined,
        undefined,
        undefined,
        { state: this.state },
        false
      );
    }
    
    this.state = 'failed';
    this.endTime = new Date();
    
    // Execute rollback steps in reverse order
    for (const rollbackStep of this.rollbackSteps) {
      try {
        if (this.options.onRollback) {
          this.options.onRollback(rollbackStep);
        }
        
        await this.executeRollbackStep(rollbackStep);
        this.emit('rollbackStep', rollbackStep);
        
      } catch (error) {
        this.emit('rollbackError', { step: rollbackStep, error });
        // Continue with other rollback steps even if one fails
      }
    }
    
    this.state = 'rolled_back';
    this.emit('rolledBack', this.getResult());
  }
  
  private async executeRollbackStep(step: RollbackStep): Promise<void> {
    switch (step.operation) {
      case 'copy':
        if (step.source && step.dest) {
          await this.shell.copy(step.source, step.dest);
        }
        break;
        
      case 'move':
        if (step.source && step.dest) {
          await this.shell.move(step.source, step.dest);
        }
        break;
        
      case 'remove':
        if (step.dest) {
          await this.shell.remove(step.dest, { recursive: true, force: true });
        }
        break;
        
      case 'write':
        if (step.dest && step.originalContent !== undefined) {
          await writeFile(step.dest, step.originalContent, 'utf-8');
        }
        break;
        
      default:
        // Unknown operation, skip
        break;
    }
  }
  
  public getSteps(): readonly TransactionStep[] {
    return [...this.steps];
  }
  
  public getState(): TransactionState {
    return this.state;
  }
  
  public getResult<T = any>(): TransactionResult<T> {
    return {
      id: this.id,
      state: this.state,
      steps: this.getSteps(),
      rollbackSteps: [...this.rollbackSteps],
      duration: this.endTime ? this.endTime.getTime() - this.startTime.getTime() : Date.now() - this.startTime.getTime(),
      startTime: this.startTime,
      endTime: this.endTime
    };
  }
}

/**
 * Transaction manager for handling multiple transactions
 */
export class TransactionManager extends EventEmitter {
  private transactions = new Map<string, Transaction>();
  
  constructor(private shell: any) {
    super();
  }
  
  public begin(options?: TransactionOptions): Transaction {
    const transaction = new Transaction(this.shell, options);
    this.transactions.set(transaction.getResult().id, transaction);
    
    // Forward transaction events
    transaction.on('step', (step) => this.emit('transactionStep', transaction.getResult().id, step));
    transaction.on('committed', (result) => {
      this.emit('transactionCommitted', result);
      this.transactions.delete(result.id);
    });
    transaction.on('rolledBack', (result) => {
      this.emit('transactionRolledBack', result);
      this.transactions.delete(result.id);
    });
    transaction.on('error', (error) => this.emit('transactionError', transaction.getResult().id, error));
    
    this.emit('transactionStarted', transaction.getResult());
    return transaction;
  }
  
  public getTransaction(id: string): Transaction | undefined {
    return this.transactions.get(id);
  }
  
  public getActiveTransactions(): Transaction[] {
    return Array.from(this.transactions.values());
  }
  
  public async rollbackAll(): Promise<void> {
    const promises = Array.from(this.transactions.values()).map(tx => 
      tx.rollback().catch(() => {}) // Ignore individual rollback errors
    );
    await Promise.all(promises);
  }
  
  public async commitAll(): Promise<void> {
    const promises = Array.from(this.transactions.values()).map(tx => tx.commit());
    await Promise.all(promises);
  }
}

/**
 * Create a new transaction manager
 */
export function createTransactionManager(shell: any): TransactionManager {
  return new TransactionManager(shell);
}