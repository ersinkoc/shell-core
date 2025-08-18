# @oxog/shell-core Examples

This directory contains comprehensive examples demonstrating the capabilities of the @oxog/shell-core library.

## 🚀 Getting Started

Run any example with Node.js:

```bash
node examples/basic-usage.js
node examples/advanced-pipeline.js
node examples/transaction-demo.js
```

## 📚 Available Examples

### 1. Basic Usage (`basic-usage.js`)
**Perfect for beginners** - Demonstrates core functionality:
- File system operations (copy, move, remove)
- Command execution and parallel processing
- Text processing and manipulation
- Configuration options
- Error handling patterns
- Performance statistics

```bash
node examples/basic-usage.js
```

### 2. Advanced Pipeline (`advanced-pipeline.js`)
**Intermediate level** - Shows pipeline processing power:
- Complex file filtering and transformation
- Chained operations
- Data processing workflows
- Performance optimization techniques
- Custom transformation functions

```bash
node examples/advanced-pipeline.js
```

### 3. Transaction System (`transaction-demo.js`)
**Advanced** - Demonstrates atomic operations:
- Transaction-based operations
- Automatic rollback on failure
- Complex multi-step processes
- Data integrity guarantees
- Error recovery mechanisms

```bash
node examples/transaction-demo.js
```

### 4. Build Automation (`build-automation.js`)
**Production ready** - Complete build system example:
- TypeScript compilation
- Asset processing and optimization
- Testing and quality checks
- Deployment preparation
- Transaction-based builds with rollback
- Build health checks and reporting

```bash
node examples/build-automation.js
```

### 5. Log Analysis (`log-analysis.js`)
**Data processing** - Advanced text processing and analysis:
- Log file parsing and filtering
- Pattern matching and data extraction
- Statistical analysis and reporting
- Anomaly detection
- Report generation
- Performance monitoring

```bash
node examples/log-analysis.js
```

### 6. Watch System (`watch-demo.js`)
**Real-time monitoring** - File system monitoring:
- Directory watching
- File change detection
- Event-driven processing
- Hot reload implementations
- Development tool integration

```bash
node examples/watch-demo.js
```

## 🎯 Example Categories

### 📁 File Operations
- `basic-usage.js` - Basic file operations
- `advanced-pipeline.js` - Advanced file processing
- `build-automation.js` - Production file workflows

### ⚡ Command Execution  
- `basic-usage.js` - Simple command execution
- `build-automation.js` - Complex build commands
- `transaction-demo.js` - Atomic command sequences

### 📄 Text Processing
- `basic-usage.js` - Basic text operations
- `log-analysis.js` - Advanced text analysis
- `advanced-pipeline.js` - Text transformation pipelines

### 🔄 Transaction Processing
- `transaction-demo.js` - Core transaction features
- `build-automation.js` - Production transaction usage
- All examples include error handling

### 🎨 Advanced Features
- `build-automation.js` - Complete build system
- `log-analysis.js` - Data analysis and reporting
- `watch-demo.js` - Real-time file monitoring

## 💡 Usage Patterns

### Error Handling
All examples demonstrate proper error handling:

```javascript
try {
  const result = await shell.transaction(async (tx) => {
    // Complex operations
    return result;
  });
} catch (error) {
  console.error('Operation failed:', error.message);
  // All changes automatically rolled back
}
```

### Configuration
Examples show different configuration approaches:

```javascript
// Basic configuration
const shell = createShell({
  silent: true,
  timeout: 30000
});

// Production configuration
const shell = createShell({
  verbose: true,
  fatal: false,
  retries: 3
});
```

### Pipeline Processing
Complex data processing patterns:

```javascript
await shell.pipeline()
  .glob('**/*.js')
  .filterBySize({ min: 1000 })
  .map(file => processFile(file))
  .copyTo('processed/')
  .execute();
```

## 🏗️ Real-World Applications

### Build Systems
- `build-automation.js` shows complete build pipeline
- TypeScript compilation, testing, asset processing
- Production deployment preparation

### Monitoring & Analytics  
- `log-analysis.js` demonstrates log processing
- Real-time analysis and anomaly detection
- Automated reporting and alerting

### Development Tools
- `watch-demo.js` shows development server features
- Hot reload and live development
- File change automation

### Data Processing
- `advanced-pipeline.js` shows ETL patterns
- Large dataset processing
- Transformation and aggregation

## 🚀 Running Examples

### Prerequisites
- Node.js 16.0.0 or higher
- @oxog/shell-core installed

### Installation
```bash
npm install @oxog/shell-core
```

### Running Individual Examples
```bash
# Basic functionality
node examples/basic-usage.js

# Advanced patterns
node examples/advanced-pipeline.js

# Production workflows
node examples/build-automation.js

# Data analysis
node examples/log-analysis.js
```

### Custom Examples
Create your own example:

```javascript
import { createShell } from '@oxog/shell-core';

const shell = createShell();

async function myExample() {
  // Your code here
  await shell.mkdir('my-project');
  await shell.writeFile('my-project/README.md', '# My Project');
  console.log('✅ Example completed!');
}

myExample().catch(console.error);
```

## 📖 Documentation

- **Full API Reference**: [README.md](../README.md)
- **Contributing Guide**: [CONTRIBUTING.md](../CONTRIBUTING.md)
- **GitHub Repository**: https://github.com/ersinkoc/shell-core

## 🤝 Contributing

Found an issue or want to add an example? 

1. Fork the repository
2. Create your example
3. Add documentation  
4. Submit a pull request

We welcome examples for:
- Cloud deployment automation
- Database migration scripts
- Docker container management
- CI/CD pipeline integration
- Microservices orchestration

## 👤 Author

**Ersin KOÇ** - *Founder & Maintainer*

- GitHub: [@ersinkoc](https://github.com/ersinkoc)
- Repository: [shell-core](https://github.com/ersinkoc/shell-core)

---

*These examples showcase the power and flexibility of @oxog/shell-core for modern Node.js applications.*