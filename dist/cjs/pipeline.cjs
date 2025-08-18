"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextPipeline = exports.FilePipeline = exports.Pipeline = void 0;
const events_1 = require("events");
const errors_js_1 = require("./errors.js");
const utils_js_1 = require("./utils.js");
class Pipeline extends events_1.EventEmitter {
    constructor(shellInstance, options = {}) {
        super();
        this.steps = [];
        this.shellInstance = shellInstance;
        this.options = {
            parallel: 4,
            failFast: true,
            dryRun: false,
            verbose: false,
            ...options
        };
    }
    transform(fn, name) {
        const step = {
            type: 'transform',
            name: name ?? `transform-${this.steps.length}`,
            execute: fn
        };
        this.steps.push(step);
        return this;
    }
    filter(predicate, name) {
        const step = {
            type: 'filter',
            name: name ?? `filter-${this.steps.length}`,
            execute: predicate
        };
        this.steps.push(step);
        return this;
    }
    map(fn, name) {
        const step = {
            type: 'map',
            name: name ?? `map-${this.steps.length}`,
            execute: fn
        };
        this.steps.push(step);
        return this;
    }
    parallel(concurrency) {
        this.options.parallel = concurrency;
        return this;
    }
    progress(callback) {
        this.on('progress', callback);
        return this;
    }
    async execute(input) {
        const inputs = Array.isArray(input) ? input : [input];
        if (this.options.dryRun) {
            this.emit('dryRun', {
                steps: this.steps.map(s => s.name),
                inputs: inputs.length,
                options: this.options
            });
            return inputs;
        }
        return await this.executeSteps(inputs);
    }
    async executeSteps(inputs) {
        let currentData = inputs;
        // If no steps, just emit progress for the passthrough
        if (this.steps.length === 0) {
            this.emit('progress', inputs.length, inputs.length);
            return currentData;
        }
        for (let stepIndex = 0; stepIndex < this.steps.length; stepIndex++) {
            const step = this.steps[stepIndex];
            if (this.options.verbose) {
                this.emit('stepStart', { step: step.name, inputs: currentData.length });
            }
            try {
                currentData = await this.executeStep(step, currentData, stepIndex);
                if (this.options.verbose) {
                    this.emit('stepComplete', { step: step.name, outputs: currentData.length });
                }
            }
            catch (error) {
                this.emit('stepError', { step: step.name, error });
                if (this.options.failFast) {
                    // Preserve the original error code if it's a ShellError
                    const errorCode = error.code || 'INVALID_OPERATION';
                    throw new errors_js_1.ShellError(`Pipeline failed at step '${step.name}': ${error instanceof Error ? error.message : String(error)}`, errorCode, 'pipeline', undefined, undefined, undefined, { step: step.name, error });
                }
            }
        }
        return currentData;
    }
    async executeStep(step, inputs, _stepIndex) {
        const concurrency = this.options.parallel ?? 4;
        const results = [];
        const errors = [];
        if (concurrency === 1 || inputs.length === 1) {
            // Sequential execution
            for (let i = 0; i < inputs.length; i++) {
                const input = inputs[i];
                try {
                    const result = await this.executeStepOnInput(step, input);
                    if (step.type === 'filter') {
                        if (result) {
                            results.push(input);
                        }
                    }
                    else {
                        results.push(result);
                    }
                }
                catch (error) {
                    errors.push(error);
                    if (this.options.failFast)
                        break;
                }
                this.emit('progress', i + 1, inputs.length);
            }
        }
        else {
            // Parallel execution
            const chunks = this.chunkArray(inputs, concurrency);
            for (const chunk of chunks) {
                const chunkPromises = chunk.map(async (input, index) => {
                    try {
                        const result = await this.executeStepOnInput(step, input);
                        return { success: true, result, input, index };
                    }
                    catch (error) {
                        return { success: false, error, input, index };
                    }
                });
                const chunkResults = await Promise.all(chunkPromises);
                for (const chunkResult of chunkResults) {
                    if (chunkResult.success) {
                        if (step.type === 'filter') {
                            if (chunkResult.result) {
                                results.push(chunkResult.input);
                            }
                        }
                        else {
                            results.push(chunkResult.result);
                        }
                    }
                    else {
                        errors.push(chunkResult.error);
                        if (this.options.failFast)
                            break;
                    }
                }
                if (this.options.failFast && errors.length > 0)
                    break;
                this.emit('progress', results.length, inputs.length);
            }
        }
        if (errors.length > 0 && this.options.failFast) {
            throw errors[0];
        }
        return results;
    }
    async executeStepOnInput(step, input) {
        if (step.condition && !step.condition(input)) {
            return step.type === 'filter' ? false : input;
        }
        return await step.execute(input);
    }
    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}
exports.Pipeline = Pipeline;
class FilePipeline extends Pipeline {
    constructor(shellInstance, options = {}) {
        super(shellInstance, options);
    }
    get shell() {
        return this.shellInstance;
    }
    find(pattern) {
        const matcher = (0, utils_js_1.createPathMatcher)(pattern);
        return this.filter(path => {
            // Extract filename from full path for matching
            const filename = path.split(/[/\\]/).pop() || path;
            return matcher(filename);
        }, `find-${pattern}`);
    }
    filterBySize(minSize, maxSize) {
        return this.filter(async (path) => {
            try {
                const info = await (0, utils_js_1.getFileInfo)(path);
                if (minSize !== undefined && info.size < minSize)
                    return false;
                if (maxSize !== undefined && info.size > maxSize)
                    return false;
                return true;
            }
            catch {
                return false;
            }
        }, 'filterBySize');
    }
    filterByType(type) {
        return this.filter(async (path) => {
            try {
                const info = await (0, utils_js_1.getFileInfo)(path);
                // Handle array of extensions
                if (Array.isArray(type)) {
                    if (!info.isFile)
                        return false;
                    const filename = path.split(/[/\\]/).pop() || '';
                    const ext = filename.split('.').pop()?.toLowerCase() || '';
                    return type.some(t => t.toLowerCase() === ext);
                }
                // Handle single extension
                if (typeof type === 'string' && !['file', 'directory', 'symlink'].includes(type)) {
                    if (!info.isFile)
                        return false;
                    const filename = path.split(/[/\\]/).pop() || '';
                    const ext = filename.split('.').pop()?.toLowerCase() || '';
                    return ext === type.toLowerCase();
                }
                // Handle standard file system types
                switch (type) {
                    case 'file': return info.isFile;
                    case 'directory': return info.isDirectory;
                    case 'symlink': return info.isSymlink;
                    default: return false;
                }
            }
            catch {
                return false;
            }
        }, `filterBy-${Array.isArray(type) ? type.join(',') : type}`);
    }
    filterByAge(olderThan, newerThan) {
        return this.filter(async (path) => {
            try {
                const info = await (0, utils_js_1.getFileInfo)(path);
                if (olderThan && info.mtime > olderThan)
                    return false;
                if (newerThan && info.mtime < newerThan)
                    return false;
                return true;
            }
            catch {
                return false;
            }
        }, 'filterByAge');
    }
    rename(fn) {
        return this.transform(async (path) => {
            const resolvedPath = (0, utils_js_1.resolvePath)(path);
            const info = await (0, utils_js_1.getFileInfo)(resolvedPath);
            if (!info.isFile)
                return path;
            const parts = resolvedPath.split(/[\\/]/);
            const filename = parts[parts.length - 1];
            const newFilename = fn(filename);
            if (newFilename !== filename) {
                parts[parts.length - 1] = newFilename;
                const newPath = parts.join(process.platform === 'win32' ? '\\' : '/');
                // Actually rename the file with __internal flag to ensure errors are thrown
                await this.shell.move(resolvedPath, newPath, { __internal: true });
                return newPath;
            }
            return path;
        }, 'rename');
    }
    moveTo(destination) {
        return this.transform(async (path) => {
            const resolvedDest = (0, utils_js_1.resolvePath)(destination);
            const filename = path.split(/[/\\]/).pop() || '';
            const destPath = (0, utils_js_1.joinPaths)(resolvedDest, filename);
            await this.shell.move(path, destPath);
            return destPath;
        }, `moveTo-${destination}`);
    }
    copyTo(destination, options) {
        return this.transform(async (path) => {
            const resolvedDest = (0, utils_js_1.resolvePath)(destination);
            const filename = path.split(/[/\\]/).pop() || '';
            const destPath = (0, utils_js_1.joinPaths)(resolvedDest, filename);
            // Pass __internal flag to ensure errors are thrown
            await this.shell.copy(path, destPath, { ...options, __internal: true });
            return destPath; // Return new path after copy
        }, `copyTo-${destination}`);
    }
    remove(options) {
        return this.transform(async (path) => {
            await this.shell.remove(path, { recursive: true, ...options });
            return path;
        }, 'remove');
    }
    compress(algorithm = 'gzip') {
        return this.transform(async (path) => {
            const compressedPath = `${path}.${algorithm === 'gzip' ? 'gz' : 'zip'}`;
            // This would need to be implemented based on the compression library
            // For now, return the original path
            return compressedPath;
        }, `compress-${algorithm}`);
    }
    getInfo() {
        return this.map(async (path) => {
            return await (0, utils_js_1.getFileInfo)(path);
        }, 'getInfo');
    }
}
exports.FilePipeline = FilePipeline;
class TextPipeline extends Pipeline {
    constructor(shellInstance, options = {}) {
        super(shellInstance, options);
    }
    get shell() {
        return this.shellInstance;
    }
    // Override execute to handle text operations on the entire input array
    async execute(input) {
        const inputs = Array.isArray(input) ? input : [input];
        if (this.options.dryRun) {
            this.emit('dryRun', {
                steps: this.steps.map(s => s.name),
                inputs: inputs.length,
                options: this.options
            });
            return inputs;
        }
        // For text operations, process the entire array as one unit
        let currentData = inputs;
        let hasNonTransformOps = false;
        let hasSingleWrappingTransform = false;
        for (const step of this.steps) {
            if (step.type === 'transform') {
                // Transform steps in TextPipeline process the entire array at once
                const result = await step.execute(currentData);
                // Check if this is a wrapping transform that returns [value]
                if (Array.isArray(result) && result.length === 1) {
                    // This is a wrapping transform step - unwrap for processing
                    currentData = result[0];
                    // Track if this is the only operation
                    if (this.steps.length === 1) {
                        hasSingleWrappingTransform = true;
                    }
                }
                else {
                    currentData = result;
                }
            }
            else if (step.type === 'filter') {
                currentData = currentData.filter(item => step.execute(item));
                hasNonTransformOps = true;
            }
            else if (step.type === 'map') {
                const results = await Promise.all(currentData.map(item => step.execute(item)));
                currentData = results;
                hasNonTransformOps = true;
            }
        }
        // Only wrap if there's a single wrapping transform and no other operations
        return hasSingleWrappingTransform ? [currentData] : currentData;
    }
    grep(pattern, options) {
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, options?.ignoreCase ? 'i' : '')
            : pattern;
        return this.filter((line) => {
            const matches = regex.test(line);
            return options?.invert ? !matches : matches;
        }, `grep-${pattern}`);
    }
    sed(pattern, replacement) {
        const regex = typeof pattern === 'string' ? new RegExp(pattern, 'g') : pattern;
        return this.map((line) => {
            return line.replace(regex, replacement);
        }, `sed-${pattern}`);
    }
    head(lines) {
        // Create a special step that processes the entire input at once
        const step = {
            name: `head-${lines}`,
            type: 'transform',
            execute: async (input) => {
                return [input.slice(0, lines)];
            }
        };
        const newPipeline = new TextPipeline(this.shellInstance, this.options);
        newPipeline.steps = [...this.steps, step];
        return newPipeline;
    }
    tail(lines) {
        // Create a special step that processes the entire input at once
        const step = {
            name: `tail-${lines}`,
            type: 'transform',
            execute: async (input) => {
                return [input.slice(-lines)];
            }
        };
        const newPipeline = new TextPipeline(this.shellInstance, this.options);
        newPipeline.steps = [...this.steps, step];
        return newPipeline;
    }
    sort(options) {
        const step = {
            name: 'sort',
            type: 'transform',
            execute: async (input) => {
                const lines = [...input]; // Don't mutate original
                lines.sort((a, b) => {
                    let result;
                    if (options?.numeric) {
                        result = parseFloat(a) - parseFloat(b);
                    }
                    else {
                        if (options?.ignoreCase) {
                            result = a.toLowerCase().localeCompare(b.toLowerCase());
                        }
                        else {
                            // Use default string comparison for consistency with JavaScript's default sort
                            result = a < b ? -1 : a > b ? 1 : 0;
                        }
                    }
                    return options?.reverse ? -result : result;
                });
                return [lines];
            }
        };
        const newPipeline = new TextPipeline(this.shellInstance, this.options);
        newPipeline.steps = [...this.steps, step];
        return newPipeline;
    }
    unique() {
        const seen = new Set();
        return this.filter((line) => {
            if (seen.has(line)) {
                return false;
            }
            seen.add(line);
            return true;
        }, 'unique');
    }
    count() {
        const step = {
            name: 'count',
            type: 'transform',
            execute: async (input) => {
                return [input.length];
            }
        };
        const newPipeline = new TextPipeline(this.shellInstance, this.options);
        newPipeline.steps = [...this.steps, step];
        return newPipeline;
    }
    join(separator = '\n') {
        const step = {
            name: 'join',
            type: 'transform',
            execute: async (input) => {
                return [input.join(separator)];
            }
        };
        const newPipeline = new TextPipeline(this.shellInstance, this.options);
        newPipeline.steps = [...this.steps, step];
        return newPipeline;
    }
}
exports.TextPipeline = TextPipeline;
//# sourceMappingURL=pipeline.js.map