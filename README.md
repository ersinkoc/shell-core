# @oxog/shell-core

[![npm version](https://badge.fury.io/js/%40oxog%2Fshell-core.svg)](https://badge.fury.io/js/%40oxog%2Fshell-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![Test Coverage](https://img.shields.io/badge/Coverage-100%25-brightgreen.svg)](https://github.com/ersinkoc/shell-core)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-success.svg)](https://www.npmjs.com/package/@oxog/shell-core)

**Zero-Dependency Node.js Shell Commands Library** - A modern, high-performance alternative to ShellJS with TypeScript support, advanced pipeline operations, and comprehensive cross-platform compatibility.

## 🚀 Features

- **🔥 Zero Dependencies** - No external dependencies, pure Node.js
- **⚡ High Performance** - Optimized for speed and memory efficiency  
- **🎯 TypeScript First** - Full TypeScript support with complete type definitions
- **🔧 Pipeline Operations** - Advanced chaining and transformation capabilities
- **🔄 Transaction System** - Atomic operations with automatic rollback
- **📊 Progress Tracking** - Built-in progress monitoring for long operations
- **🎨 Plugin Architecture** - Extensible with custom commands and transformers
- **🌐 Cross-Platform** - Works seamlessly on Windows, macOS, and Linux
- **⚙️ Configurable** - Flexible configuration for different environments
- **🧪 100% Test Coverage** - Thoroughly tested with comprehensive test suite

## 📦 Installation

```bash
npm install @oxog/shell-core
```

## 🎯 Quick Start

```javascript
import { createShell } from '@oxog/shell-core';

const shell = createShell();

// Basic file operations
await shell.copy('source.txt', 'destination.txt');
await shell.mkdir('new-directory', { recursive: true });
await shell.remove('old-file.txt');

// Command execution
const result = await shell.exec('npm --version');
console.log(result.stdout);

// Text processing
const content = await shell.readFile('data.txt');
const lines = shell.text(content).grep('important').head(10).result;

// Pipeline operations
await shell.pipeline()
  .glob('**/*.js')
  .filterBySize({ min: 1000 })
  .copyTo('backup/')
  .execute();
```

## 📚 Core Concepts

### Shell Instance

Create a shell instance with optional configuration:

```javascript
import { createShell } from '@oxog/shell-core';

const shell = createShell({
  silent: false,        // Show command output
  fatal: true,          // Exit on errors
  verbose: false,       // Detailed logging
  dryRun: false,        // Preview mode
  maxBuffer: 1024 * 1024, // Command output buffer size
  timeout: 30000,       // Default timeout (ms)
  retries: 3,           // Retry attempts
  cwd: process.cwd()    // Working directory
});
```

### File System Operations

```javascript
// File operations
await shell.copy('file.txt', 'backup/file.txt');
await shell.move('old-location/file.txt', 'new-location/');
await shell.remove('unwanted-file.txt');
await shell.touch('new-file.txt');

// Directory operations
await shell.mkdir('nested/directory', { recursive: true });
await shell.rmdir('empty-directory');

// File information
const info = await shell.stat('file.txt');
console.log(`Size: ${info.size}, Modified: ${info.mtime}`);
```

### Command Execution

```javascript
// Simple command execution
const result = await shell.exec('node --version');
console.log(result.stdout);

// Command with options
const result = await shell.exec('git status', {
  cwd: '/path/to/repo',
  timeout: 10000,
  env: { ...process.env, GIT_DIR: '/custom/git' }
});

// Parallel execution
const results = await shell.parallel([
  'npm test',
  'npm run lint',
  'npm run build'
]);
```

### Text Processing

```javascript
const shell = createShell();

// Chain text operations
const processed = shell.text(content)
  .grep('ERROR')
  .sort()
  .uniq()
  .head(20)
  .result;

// Text transformations
const modified = shell.text(lines)
  .sed('old-text', 'new-text')
  .map(line => line.toUpperCase())
  .join('\n');
```

### Pipeline Operations

Powerful pipeline system for file processing:

```javascript
// File pipeline
await shell.pipeline()
  .glob('src/**/*.js')
  .filterByType('file')
  .filterBySize({ min: 100, max: 50000 })
  .map(file => shell.transform(file, content => content.replace(/var /g, 'const ')))
  .copyTo('processed/')
  .execute();

// Text pipeline
const result = await shell.textPipeline()
  .input(['line1', 'line2', 'line3'])
  .filter(line => line.includes('important'))
  .map(line => line.toUpperCase())
  .sort()
  .execute();
```

### Transaction System

Atomic operations with automatic rollback:

```javascript
try {
  const result = await shell.transaction(async (tx) => {
    await tx.mkdir('temp-work');
    await tx.copy('important.txt', 'temp-work/backup.txt');
    await tx.writeFile('temp-work/log.txt', 'Processing...');
    
    // If any operation fails, all changes are rolled back
    await tx.exec('risky-command');
    
    return { success: true, processed: 42 };
  });
  
  console.log('Transaction completed:', result);
} catch (error) {
  console.log('Transaction failed and rolled back:', error.message);
}
```

### Plugin System

Extend functionality with custom plugins:

```javascript
const customPlugin = {
  name: 'my-plugin',
  version: '1.0.0',
  commands: {
    'my.hello': (name) => `Hello, ${name}!`
  },
  filters: {
    'my.uppercase': (text) => text.toUpperCase()
  },
  transformers: {
    'my.prefix': (prefix) => (text) => `${prefix}: ${text}`
  }
};

shell.use(customPlugin);

// Use custom commands
const greeting = await shell.my.hello('World');
const filtered = shell.applyFilter('my.uppercase', 'hello world');
```

### Watch System

Monitor file system changes:

```javascript
const watcher = shell.watch('/path/to/directory', {
  recursive: true,
  ignored: ['node_modules', '.git']
});

watcher.on('add', (path) => console.log(`Added: ${path}`));
watcher.on('change', (path) => console.log(`Changed: ${path}`));
watcher.on('unlink', (path) => console.log(`Removed: ${path}`));

// Stop watching
await watcher.close();
```

## 🎨 Advanced Examples

### Build Script Automation

```javascript
import { createShell } from '@oxog/shell-core';

const shell = createShell({ verbose: true });

async function buildProject() {
  console.log('🚀 Starting build process...');
  
  // Clean previous build
  await shell.remove('dist');
  await shell.mkdir('dist');
  
  // Build pipeline
  await shell.transaction(async (tx) => {
    // Compile TypeScript
    await tx.exec('tsc');
    
    // Copy assets
    await tx.pipeline()
      .glob('src/**/*.{json,css,html}')
      .copyTo('dist/')
      .execute();
    
    // Minify JavaScript
    await tx.pipeline()
      .glob('dist/**/*.js')
      .map(file => tx.exec(`terser ${file} -o ${file} -m`))
      .execute();
    
    return { buildTime: Date.now() };
  });
  
  console.log('✅ Build completed successfully!');
}
```

### Log Analysis Tool

```javascript
async function analyzeLogs() {
  const shell = createShell();
  
  // Process log files
  const errorReport = await shell.pipeline()
    .glob('logs/**/*.log')
    .map(async (file) => {
      const content = await shell.readFile(file);
      return shell.text(content)
        .grep('ERROR')
        .map(line => ({ file, line, timestamp: line.match(/\d{4}-\d{2}-\d{2}/)?.[0] }))
        .result;
    })
    .flatten()
    .groupBy('timestamp')
    .execute();
  
  // Generate report
  await shell.writeFile('error-report.json', JSON.stringify(errorReport, null, 2));
}
```

### Deployment Script

```javascript
async function deploy() {
  const shell = createShell({ fatal: true });
  
  try {
    await shell.transaction(async (tx) => {
      // Build application
      console.log('📦 Building application...');
      await tx.exec('npm run build');
      
      // Run tests
      console.log('🧪 Running tests...');
      await tx.exec('npm test');
      
      // Deploy to server
      console.log('🚀 Deploying to server...');
      await tx.exec('rsync -avz dist/ server:/var/www/app/');
      
      // Update database
      console.log('🗄️ Updating database...');
      await tx.exec('npm run migrate');
      
      console.log('✅ Deployment successful!');
    });
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    console.log('🔄 All changes have been rolled back.');
  }
}
```

## 📖 API Reference

### Core Methods

#### File Operations
- `copy(src, dest, options?)` - Copy files or directories
- `move(src, dest, options?)` - Move files or directories  
- `remove(path, options?)` - Remove files or directories
- `mkdir(path, options?)` - Create directories
- `touch(path, options?)` - Create or update file timestamps
- `readFile(path, options?)` - Read file content
- `writeFile(path, content, options?)` - Write file content

#### Command Execution
- `exec(command, options?)` - Execute shell commands
- `spawn(command, args?, options?)` - Spawn child processes
- `parallel(commands, options?)` - Execute commands in parallel

#### Text Processing
- `text(content)` - Create text processing chain
- `grep(pattern)` - Filter lines by pattern
- `sed(pattern, replacement)` - Replace text patterns
- `head(n?)` - Get first n lines
- `tail(n?)` - Get last n lines
- `sort(options?)` - Sort lines
- `uniq()` - Remove duplicate lines

#### Pipeline Operations
- `pipeline()` - Create file pipeline
- `textPipeline()` - Create text pipeline
- `glob(pattern)` - Find files by pattern
- `filter(predicate)` - Filter items
- `map(transformer)` - Transform items
- `copyTo(dest)` - Copy to destination
- `moveTo(dest)` - Move to destination

### Configuration Options

```typescript
interface ShellConfig {
  silent?: boolean;      // Suppress output
  fatal?: boolean;       // Exit on errors
  verbose?: boolean;     // Detailed logging
  dryRun?: boolean;      // Preview mode
  maxBuffer?: number;    // Command output buffer
  timeout?: number;      // Default timeout
  retries?: number;      // Retry attempts
  cwd?: string;          // Working directory
}
```

## 🧪 Testing

The library comes with comprehensive tests:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run performance benchmarks
npm run test:performance

# Run specific test suite
npm test -- test/pipeline.test.js
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone repository
git clone https://github.com/ersinkoc/shell-core.git
cd shell-core

# Install dependencies
npm install

# Start development mode
npm run dev

# Run tests
npm test

# Build project
npm run build
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with modern Node.js APIs
- Inspired by the shell scripting ecosystem
- Designed for the TypeScript era

## 👤 Author

**Ersin KOÇ** - *Founder & Maintainer*

- GitHub: [@ersinkoc](https://github.com/ersinkoc)
- Project: [shell-core](https://github.com/ersinkoc/shell-core)

## 📊 Project Stats

- **Zero Dependencies** ✅
- **100% Test Coverage** ✅  
- **TypeScript Support** ✅
- **Cross-Platform** ✅
- **Production Ready** ✅

---

*Built with ❤️ for the Node.js community*