"use strict";
/**
 * Transaction module for @oxog/shell-core
 * Provides atomic operations with rollback capabilities
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionManager = exports.Transaction = void 0;
exports.createTransactionManager = createTransactionManager;
const events_1 = require("events");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const errors_js_1 = require("./errors.js");
const utils_js_1 = require("./utils.js");
/**
 * Transaction implementation with rollback capabilities
 */
class Transaction extends events_1.EventEmitter {
    constructor(shell, // The main shell instance
    options = {}) {
        super();
        this.shell = shell;
        this.options = options;
        this.state = 'pending';
        this.steps = [];
        this.rollbackSteps = [];
        this.backupCounter = 0;
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
    async handleTimeout() {
        this.emit('timeout', this.id);
        this.state = 'timedout';
        await this.rollback();
    }
    generateStepId() {
        return `step_${this.steps.length + 1}_${Date.now()}`;
    }
    async createBackup(filePath) {
        const backupDir = this.options.backupDir;
        const backupName = `backup_${this.backupCounter++}_${Date.now()}_${(0, path_1.basename)(filePath)}`;
        const backupPath = (0, path_1.join)(backupDir, this.id, backupName);
        // Ensure backup directory exists
        await this.shell.mkdir((0, path_1.dirname)(backupPath), { recursive: true });
        // Copy original file to backup location
        if (await (0, utils_js_1.pathExists)(filePath)) {
            await this.shell.copy(filePath, backupPath);
        }
        return backupPath;
    }
    async calculateChecksum(filePath) {
        try {
            if (await (0, utils_js_1.pathExists)(filePath)) {
                const fileInfo = await (0, utils_js_1.getFileInfo)(filePath);
                if (fileInfo.isFile) {
                    const content = await (0, promises_1.readFile)(filePath);
                    const crypto = await Promise.resolve().then(() => __importStar(require('crypto')));
                    return crypto.createHash('md5').update(content).digest('hex');
                }
            }
        }
        catch {
            // Ignore errors for checksum calculation
        }
        return undefined;
    }
    updateProgress() {
        if (this.options.onProgress) {
            const currentStep = this.steps[this.steps.length - 1];
            this.options.onProgress(currentStep, this.steps.length, this.steps.length);
        }
    }
    // Transactional operations
    async copy(source, dest, options = {}) {
        if (this.state !== 'pending' && this.state !== 'running') {
            throw new errors_js_1.ShellError('Cannot perform operations on non-active transaction', 'INVALID_OPERATION', 'transaction.copy', undefined, undefined, undefined, { state: this.state }, false);
        }
        this.state = 'running';
        const stepId = this.generateStepId();
        // Create backup if destination exists
        let backupPath;
        if (await (0, utils_js_1.pathExists)(dest)) {
            backupPath = await this.createBackup(dest);
        }
        const step = {
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
            const rollbackStep = {
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
        }
        catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    async move(source, dest, options = {}) {
        if (this.state !== 'pending' && this.state !== 'running') {
            throw new errors_js_1.ShellError('Cannot perform operations on non-active transaction', 'INVALID_OPERATION', 'transaction.move', undefined, undefined, undefined, { state: this.state }, false);
        }
        this.state = 'running';
        const stepId = this.generateStepId();
        // Create backup of source and destination
        const sourceBackup = await this.createBackup(source);
        let destBackup;
        if (await (0, utils_js_1.pathExists)(dest)) {
            destBackup = await this.createBackup(dest);
        }
        const step = {
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
            const rollbackStep = {
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
        }
        catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    async remove(path, options = {}) {
        if (this.state !== 'pending' && this.state !== 'running') {
            throw new errors_js_1.ShellError('Cannot perform operations on non-active transaction', 'INVALID_OPERATION', 'transaction.remove', undefined, undefined, undefined, { state: this.state }, false);
        }
        this.state = 'running';
        const stepId = this.generateStepId();
        // Create backup before removal
        const backupPath = await this.createBackup(path);
        const originalStats = await (0, utils_js_1.pathExists)(path) ? await (0, promises_1.stat)(path) : undefined;
        const step = {
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
            const rollbackStep = {
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
        }
        catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    async mkdir(path, options = {}) {
        if (this.state !== 'pending' && this.state !== 'running') {
            throw new errors_js_1.ShellError('Cannot perform operations on non-active transaction', 'INVALID_OPERATION', 'transaction.mkdir', undefined, undefined, undefined, { state: this.state }, false);
        }
        this.state = 'running';
        const stepId = this.generateStepId();
        const step = {
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
            const rollbackStep = {
                stepId,
                operation: 'remove',
                dest: path,
                timestamp: new Date()
            };
            this.steps.push(step);
            this.rollbackSteps.unshift(rollbackStep);
            this.emit('step', step);
            this.updateProgress();
        }
        catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    async touch(path, options = {}) {
        if (this.state !== 'pending' && this.state !== 'running') {
            throw new errors_js_1.ShellError('Cannot perform operations on non-active transaction', 'INVALID_OPERATION', 'transaction.touch', undefined, undefined, undefined, { state: this.state }, false);
        }
        this.state = 'running';
        const stepId = this.generateStepId();
        // Backup if file exists
        let backupPath;
        const existedBefore = await (0, utils_js_1.pathExists)(path);
        if (existedBefore) {
            backupPath = await this.createBackup(path);
        }
        const step = {
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
            const rollbackStep = existedBefore ? {
                stepId,
                operation: 'copy',
                source: backupPath,
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
        }
        catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    async exec(command, options = {}) {
        if (this.state !== 'pending' && this.state !== 'running') {
            throw new errors_js_1.ShellError('Cannot perform operations on non-active transaction', 'INVALID_OPERATION', 'transaction.exec', undefined, undefined, undefined, { state: this.state }, false);
        }
        this.state = 'running';
        const stepId = this.generateStepId();
        const step = {
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
        }
        catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    async spawn(command, args = [], options = {}) {
        if (this.state !== 'pending' && this.state !== 'running') {
            throw new errors_js_1.ShellError('Cannot perform operations on non-active transaction', 'INVALID_OPERATION', 'transaction.spawn', undefined, undefined, undefined, { state: this.state }, false);
        }
        this.state = 'running';
        const stepId = this.generateStepId();
        const step = {
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
        }
        catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    async writeFile(path, content) {
        if (this.state !== 'pending' && this.state !== 'running') {
            throw new errors_js_1.ShellError('Cannot perform operations on non-active transaction', 'INVALID_OPERATION', 'transaction.writeFile', undefined, undefined, undefined, { state: this.state }, false);
        }
        this.state = 'running';
        const stepId = this.generateStepId();
        // Backup original content if file exists
        let originalContent;
        let backupPath;
        if (await (0, utils_js_1.pathExists)(path)) {
            originalContent = await (0, promises_1.readFile)(path, 'utf-8');
            backupPath = await this.createBackup(path);
        }
        const step = {
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
            await (0, promises_1.writeFile)(path, content, 'utf-8');
            // Create rollback step
            const rollbackStep = originalContent !== undefined ? {
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
        }
        catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    async readFile(path) {
        return await (0, promises_1.readFile)(path, 'utf-8');
    }
    async commit() {
        if (this.state === 'timedout') {
            throw errors_js_1.ShellError.timeout('transaction', this.options.timeout || 0);
        }
        if (this.state !== 'running' && this.state !== 'pending') {
            throw new errors_js_1.ShellError('Cannot commit transaction in current state', 'INVALID_OPERATION', 'transaction.commit', undefined, undefined, undefined, { state: this.state }, false);
        }
        this.state = 'committed';
        this.endTime = new Date();
        // Clean up backup directory if commit is successful
        if (this.options.backupDir) {
            try {
                const backupPath = (0, path_1.join)(this.options.backupDir, this.id);
                if (await (0, utils_js_1.pathExists)(backupPath)) {
                    await this.shell.remove(backupPath, { recursive: true, force: true });
                }
            }
            catch {
                // Ignore cleanup errors
            }
        }
        this.emit('committed', this.getResult());
    }
    async rollback() {
        if (this.state === 'rolled_back') {
            return; // Already rolled back
        }
        if (this.state === 'committed') {
            throw new errors_js_1.ShellError('Cannot rollback committed transaction', 'INVALID_OPERATION', 'transaction.rollback', undefined, undefined, undefined, { state: this.state }, false);
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
            }
            catch (error) {
                this.emit('rollbackError', { step: rollbackStep, error });
                // Continue with other rollback steps even if one fails
            }
        }
        this.state = 'rolled_back';
        this.emit('rolledBack', this.getResult());
    }
    async executeRollbackStep(step) {
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
                    await (0, promises_1.writeFile)(step.dest, step.originalContent, 'utf-8');
                }
                break;
            default:
                // Unknown operation, skip
                break;
        }
    }
    getSteps() {
        return [...this.steps];
    }
    getState() {
        return this.state;
    }
    getResult() {
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
exports.Transaction = Transaction;
/**
 * Transaction manager for handling multiple transactions
 */
class TransactionManager extends events_1.EventEmitter {
    constructor(shell) {
        super();
        this.shell = shell;
        this.transactions = new Map();
    }
    begin(options) {
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
    getTransaction(id) {
        return this.transactions.get(id);
    }
    getActiveTransactions() {
        return Array.from(this.transactions.values());
    }
    async rollbackAll() {
        const promises = Array.from(this.transactions.values()).map(tx => tx.rollback().catch(() => { }) // Ignore individual rollback errors
        );
        await Promise.all(promises);
    }
    async commitAll() {
        const promises = Array.from(this.transactions.values()).map(tx => tx.commit());
        await Promise.all(promises);
    }
}
exports.TransactionManager = TransactionManager;
/**
 * Create a new transaction manager
 */
function createTransactionManager(shell) {
    return new TransactionManager(shell);
}
//# sourceMappingURL=transaction.js.map