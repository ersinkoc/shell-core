"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextOperations = void 0;
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const readline_1 = require("readline");
const errors_js_1 = require("./errors.js");
const utils_js_1 = require("./utils.js");
class TextOperations {
    async grep(pattern, files, options = {}) {
        const fileList = Array.isArray(files) ? files : [files];
        const results = [];
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, `${options.ignoreCase ? 'i' : ''}${options.multiline ? 'ms' : 'm'}`)
            : pattern;
        for (const file of fileList) {
            const resolvedFile = (0, utils_js_1.resolvePath)(file);
            (0, utils_js_1.validatePath)(resolvedFile, 'grep');
            if (!await (0, utils_js_1.pathExists)(resolvedFile)) {
                if (!options.count) {
                    throw new errors_js_1.ShellError(`File not found: ${resolvedFile}`, 'ENOENT', 'grep', resolvedFile);
                }
                continue;
            }
            const fileResults = await this.grepFile(resolvedFile, regex, options);
            results.push(...fileResults);
            if (options.maxMatches && results.length >= options.maxMatches) {
                break;
            }
        }
        return results;
    }
    async grepFile(file, regex, options) {
        const results = [];
        try {
            if (options.multiline) {
                // For multiline patterns, read entire file
                const content = await (0, promises_1.readFile)(file, 'utf-8');
                const matches = content.match(new RegExp(regex.source, regex.flags + 'g')) || [];
                if (options.count) {
                    results.push(`${file}:${matches.length}`);
                }
                else {
                    matches.forEach(match => {
                        const formatted = options.lineNumber ? `${file}:${match}` : match;
                        results.push(options.invert ? '' : formatted);
                    });
                }
            }
            else {
                // Line-by-line processing for memory efficiency
                const fileStream = (0, fs_1.createReadStream)(file);
                const rl = (0, readline_1.createInterface)({
                    input: fileStream,
                    crlfDelay: Infinity
                });
                let lineNumber = 0;
                let matchCount = 0;
                for await (const line of rl) {
                    lineNumber++;
                    const isMatch = regex.test(line);
                    if (options.invert ? !isMatch : isMatch) {
                        matchCount++;
                        if (!options.count) {
                            let result = line;
                            if (options.lineNumber) {
                                result = `${file}:${lineNumber}:${line}`;
                            }
                            // Add context lines if requested
                            if (options.context || options.beforeContext || options.afterContext) {
                                // This would require more complex buffering - simplified for now
                                result = `${file}:${lineNumber}:${line}`;
                            }
                            results.push(result);
                        }
                        if (options.maxMatches && matchCount >= options.maxMatches) {
                            break;
                        }
                    }
                }
                if (options.count) {
                    results.push(`${file}:${matchCount}`);
                }
            }
        }
        catch (error) {
            throw errors_js_1.ShellError.fromNodeError(error, 'grep', file);
        }
        return results;
    }
    async sed(pattern, replacement, files, options = {}) {
        const fileList = Array.isArray(files) ? files : [files];
        const results = [];
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, options.global ? 'g' : '')
            : pattern;
        for (const file of fileList) {
            const resolvedFile = (0, utils_js_1.resolvePath)(file);
            (0, utils_js_1.validatePath)(resolvedFile, 'sed');
            if (!await (0, utils_js_1.pathExists)(resolvedFile)) {
                throw new errors_js_1.ShellError(`File not found: ${resolvedFile}`, 'ENOENT', 'sed', resolvedFile);
            }
            try {
                const content = await (0, promises_1.readFile)(resolvedFile, 'utf-8');
                const modifiedContent = content.replace(regex, replacement);
                if (options.inPlace) {
                    // Create backup if requested
                    if (options.backup) {
                        const backupFile = `${resolvedFile}${options.backup}`;
                        await (0, promises_1.writeFile)(backupFile, content);
                    }
                    await (0, promises_1.writeFile)(resolvedFile, modifiedContent);
                    results.push(`Modified: ${resolvedFile}`);
                }
                else {
                    results.push(modifiedContent);
                }
            }
            catch (error) {
                throw errors_js_1.ShellError.fromNodeError(error, 'sed', resolvedFile);
            }
        }
        return results;
    }
    async head(file, options = {}) {
        const resolvedFile = (0, utils_js_1.resolvePath)(file);
        (0, utils_js_1.validatePath)(resolvedFile, 'head');
        if (!await (0, utils_js_1.pathExists)(resolvedFile)) {
            throw new errors_js_1.ShellError(`File not found: ${resolvedFile}`, 'ENOENT', 'head', resolvedFile);
        }
        const lines = options.lines ?? 10;
        const results = [];
        try {
            if (options.bytes) {
                const content = await (0, promises_1.readFile)(resolvedFile);
                const chunk = content.subarray(0, options.bytes);
                return [chunk.toString('utf-8')];
            }
            const fileStream = (0, fs_1.createReadStream)(resolvedFile);
            const rl = (0, readline_1.createInterface)({
                input: fileStream,
                crlfDelay: Infinity
            });
            let count = 0;
            for await (const line of rl) {
                if (count >= lines)
                    break;
                results.push(line);
                count++;
            }
        }
        catch (error) {
            throw errors_js_1.ShellError.fromNodeError(error, 'head', resolvedFile);
        }
        return results;
    }
    async tail(file, options = {}) {
        const resolvedFile = (0, utils_js_1.resolvePath)(file);
        (0, utils_js_1.validatePath)(resolvedFile, 'tail');
        if (!await (0, utils_js_1.pathExists)(resolvedFile)) {
            throw new errors_js_1.ShellError(`File not found: ${resolvedFile}`, 'ENOENT', 'tail', resolvedFile);
        }
        const lines = options.lines ?? 10;
        try {
            if (options.bytes) {
                const fileInfo = await (0, utils_js_1.getFileInfo)(resolvedFile);
                const start = Math.max(0, fileInfo.size - options.bytes);
                const content = await (0, promises_1.readFile)(resolvedFile);
                const chunk = content.subarray(start);
                return [chunk.toString('utf-8')];
            }
            const content = await (0, promises_1.readFile)(resolvedFile, 'utf-8');
            const allLines = content.split('\n');
            const startIndex = Math.max(0, allLines.length - lines);
            return allLines.slice(startIndex);
        }
        catch (error) {
            throw errors_js_1.ShellError.fromNodeError(error, 'tail', resolvedFile);
        }
    }
    async sort(input, options = {}) {
        let lines;
        if (typeof input === 'string') {
            const resolvedFile = (0, utils_js_1.resolvePath)(input);
            (0, utils_js_1.validatePath)(resolvedFile, 'sort');
            if (!await (0, utils_js_1.pathExists)(resolvedFile)) {
                throw new errors_js_1.ShellError(`File not found: ${resolvedFile}`, 'ENOENT', 'sort', resolvedFile);
            }
            try {
                const content = await (0, promises_1.readFile)(resolvedFile, 'utf-8');
                lines = content.split('\n').filter(line => line.length > 0);
            }
            catch (error) {
                throw errors_js_1.ShellError.fromNodeError(error, 'sort', resolvedFile);
            }
        }
        else {
            lines = [...input];
        }
        if (options.randomize) {
            // Fisher-Yates shuffle
            for (let i = lines.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [lines[i], lines[j]] = [lines[j], lines[i]];
            }
            return lines;
        }
        let compareFn = options.compareFn;
        if (!compareFn) {
            if (options.numeric) {
                compareFn = (a, b) => {
                    const numA = parseFloat(a);
                    const numB = parseFloat(b);
                    return numA - numB;
                };
            }
            else {
                compareFn = (a, b) => {
                    const strA = options.ignoreCase ? a.toLowerCase() : a;
                    const strB = options.ignoreCase ? b.toLowerCase() : b;
                    // Use simple string comparison for ASCII ordering
                    if (strA < strB)
                        return -1;
                    if (strA > strB)
                        return 1;
                    return 0;
                };
            }
        }
        lines.sort(compareFn);
        if (options.reverse) {
            lines.reverse();
        }
        if (options.unique) {
            lines = [...new Set(lines)];
        }
        return lines;
    }
    async uniq(input, options = {}) {
        let lines;
        if (typeof input === 'string') {
            const resolvedFile = (0, utils_js_1.resolvePath)(input);
            (0, utils_js_1.validatePath)(resolvedFile, 'uniq');
            if (!await (0, utils_js_1.pathExists)(resolvedFile)) {
                throw new errors_js_1.ShellError(`File not found: ${resolvedFile}`, 'ENOENT', 'uniq', resolvedFile);
            }
            try {
                const content = await (0, promises_1.readFile)(resolvedFile, 'utf-8');
                lines = content.split('\n');
            }
            catch (error) {
                throw errors_js_1.ShellError.fromNodeError(error, 'uniq', resolvedFile);
            }
        }
        else {
            lines = [...input];
        }
        const processLine = (line) => {
            let processed = line;
            if (options.skipFields) {
                const fields = processed.split(/\s+/);
                processed = fields.slice(options.skipFields).join(' ');
            }
            if (options.skipChars) {
                processed = processed.substring(options.skipChars);
            }
            if (options.ignoreCase) {
                processed = processed.toLowerCase();
            }
            return processed;
        };
        const results = [];
        const counts = new Map();
        for (const line of lines) {
            const key = processLine(line);
            const existing = counts.get(key);
            if (existing) {
                existing.count++;
            }
            else {
                counts.set(key, { original: line, count: 1 });
            }
        }
        for (const [_, { original, count }] of counts) {
            const include = (!options.repeated && !options.unique) ||
                (options.repeated && count > 1) ||
                (options.unique && count === 1);
            if (include) {
                if (options.count) {
                    results.push(`${count} ${original}`);
                }
                else {
                    results.push(original);
                }
            }
        }
        return results;
    }
    async wc(files) {
        const fileList = Array.isArray(files) ? files : [files];
        const results = [];
        for (const file of fileList) {
            const resolvedFile = (0, utils_js_1.resolvePath)(file);
            (0, utils_js_1.validatePath)(resolvedFile, 'wc');
            if (!await (0, utils_js_1.pathExists)(resolvedFile)) {
                throw new errors_js_1.ShellError(`File not found: ${resolvedFile}`, 'ENOENT', 'wc', resolvedFile);
            }
            try {
                const content = await (0, promises_1.readFile)(resolvedFile, 'utf-8');
                const bytes = Buffer.byteLength(content, 'utf-8');
                const lines = content.length === 0 ? 0 : content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
                const words = content.split(/\s+/).filter(word => word.length > 0).length;
                const chars = content.length;
                results.push({
                    lines,
                    words,
                    chars,
                    bytes,
                    file: resolvedFile
                });
            }
            catch (error) {
                throw errors_js_1.ShellError.fromNodeError(error, 'wc', resolvedFile);
            }
        }
        return results;
    }
    cut(input, options = {}) {
        const lines = input.split('\n');
        const delimiter = options.delimiter ?? '\t';
        const outputDelimiter = options.outputDelimiter ?? delimiter;
        const results = [];
        for (const line of lines) {
            if (options.fields) {
                const fields = line.split(delimiter);
                const selectedFields = [];
                // BUG-013 FIX: Parse field selection (e.g., "1,3-5,7") with validation
                const ranges = options.fields.split(',');
                for (const range of ranges) {
                    if (range.includes('-')) {
                        const parts = range.split('-');
                        const start = parseInt(parts[0] ?? '', 10) - 1;
                        const end = parseInt(parts[1] ?? '', 10) - 1;
                        // Validate parsed numbers
                        if (isNaN(start) || isNaN(end)) {
                            continue; // Skip invalid ranges
                        }
                        for (let i = start; i <= end && i < fields.length; i++) {
                            if (i >= 0)
                                selectedFields.push(fields[i]);
                        }
                    }
                    else {
                        const index = parseInt(range, 10) - 1;
                        // Validate parsed number
                        if (!isNaN(index) && index >= 0 && index < fields.length) {
                            selectedFields.push(fields[index]);
                        }
                    }
                }
                results.push(selectedFields.join(outputDelimiter));
            }
            else if (options.characters) {
                // Parse character selection (e.g., "1,3-5,7")
                const selectedChars = [];
                const ranges = options.characters.split(',');
                for (const range of ranges) {
                    if (range.includes('-')) {
                        // BUG-013 FIX: Validate range parsing
                        const parts = range.split('-');
                        const start = parseInt(parts[0] ?? '', 10) - 1;
                        const end = parseInt(parts[1] ?? '', 10) - 1;
                        // Validate parsed numbers
                        if (isNaN(start) || isNaN(end)) {
                            continue; // Skip invalid ranges
                        }
                        for (let i = start; i <= end && i < line.length; i++) {
                            if (i >= 0)
                                selectedChars.push(line[i]);
                        }
                    }
                    else {
                        const index = parseInt(range, 10) - 1;
                        // Validate parsed number
                        if (!isNaN(index) && index >= 0 && index < line.length) {
                            selectedChars.push(line[index]);
                        }
                    }
                }
                results.push(selectedChars.join(''));
            }
            else {
                results.push(line);
            }
        }
        return results;
    }
}
exports.TextOperations = TextOperations;
//# sourceMappingURL=text.js.map