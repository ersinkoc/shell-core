# Contributing to @oxog/shell-core

We love contributions! @oxog/shell-core is a community-driven project that benefits from the expertise and creativity of developers worldwide.

[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)
[![Contributors](https://img.shields.io/github/contributors/ersinkoc/shell-core.svg?style=flat-square)](https://github.com/ersinkoc/shell-core/graphs/contributors)

## 🎯 Ways to Contribute

- **🐛 Report bugs** - Help us identify and fix issues
- **💡 Suggest features** - Share ideas for new functionality  
- **📝 Improve documentation** - Help make our docs clearer
- **🔧 Submit code** - Fix bugs or implement features
- **🧪 Write tests** - Improve our test coverage
- **📚 Create examples** - Show real-world usage patterns
- **🎨 Improve performance** - Optimize existing code

## 🚀 Quick Start for Contributors

### 1. Fork & Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/ersinkoc/shell-core.git
cd shell-core

# Add upstream remote
git remote add upstream https://github.com/ersinkoc/shell-core.git
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

### 4. Make Your Changes

Write code, add tests, update docs as needed.

### 5. Run Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run linting
npm run lint

# Type checking
npm run typecheck
```

### 6. Commit Your Changes

```bash
git add .
git commit -m "feat: add new pipeline transformation method"
```

### 7. Push & Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## 📋 Development Setup

### Prerequisites

- **Node.js**: 16.0.0 or higher
- **npm**: 7.0.0 or higher
- **Git**: Latest version

### Project Structure

```
shell-core/
├── src/                 # TypeScript source code
│   ├── shell.ts        # Main shell implementation
│   ├── pipeline.ts     # Pipeline operations
│   ├── transaction.ts  # Transaction system
│   ├── plugins.ts      # Plugin architecture
│   └── ...
├── test/               # Test files
│   ├── basic.test.js   # Basic functionality tests
│   ├── pipeline.test.js # Pipeline tests
│   └── ...
├── examples/           # Usage examples
├── dist/              # Built JavaScript files
└── docs/              # Documentation
```

### Available Scripts

```bash
# Development
npm run dev             # Watch mode TypeScript compilation
npm run build          # Build all targets (ESM, CJS, types)
npm run clean          # Clean build artifacts

# Testing  
npm test               # Run all tests
npm run test:coverage  # Run tests with coverage report
npm run test:performance # Run performance benchmarks

# Quality
npm run lint           # ESLint checking
npm run lint:fix       # Auto-fix linting issues
npm run typecheck      # TypeScript type checking

# Publishing
npm run prepublishOnly # Pre-publish checks
```

## 🧪 Testing Guidelines

We maintain **100% test coverage**. All contributions must include appropriate tests.

### Writing Tests

```javascript
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { createShell } from '../dist/esm/index.js';

describe('New Feature Tests', () => {
  test('should do something specific', async () => {
    const shell = createShell({ silent: true });
    
    // Arrange
    const input = 'test-input';
    
    // Act
    const result = await shell.newMethod(input);
    
    // Assert
    assert.equal(result.status, 'success');
    assert.ok(result.data.length > 0);
  });
});
```

### Test Categories

- **Unit Tests**: Test individual functions/methods
- **Integration Tests**: Test component interactions  
- **E2E Tests**: Test complete workflows
- **Performance Tests**: Benchmark critical paths
- **Error Tests**: Test error conditions and edge cases

### Running Specific Tests

```bash
# Run single test file
npm test -- test/pipeline.test.js

# Run tests matching pattern
npm test -- --grep "transaction"

# Run with specific Node test options
node --test --test-reporter=spec test/**/*.test.js
```

## 📝 Code Style Guidelines

We use ESLint and TypeScript for code quality and consistency.

### TypeScript Guidelines

```typescript
// ✅ Good: Use descriptive interfaces
interface FileOperationOptions {
  recursive?: boolean;
  force?: boolean;
  timeout?: number;
}

// ✅ Good: Use async/await for promises
async function copyFile(src: string, dest: string): Promise<void> {
  try {
    await fs.copyFile(src, dest);
  } catch (error) {
    throw new ShellError(`Failed to copy ${src}`, 'COPY_FAILED', { src, dest });
  }
}

// ❌ Avoid: Generic or unclear types
async function doStuff(data: any): Promise<any> {
  return data.stuff;
}
```

### Code Organization

```typescript
// File structure within modules:

// 1. Imports
import { promises as fs } from 'fs';
import { ShellError } from './errors.js';

// 2. Types and interfaces  
interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number;
}

// 3. Constants
const DEFAULT_TIMEOUT = 30000;

// 4. Main class/functions
export class FileOperations {
  // Public methods first
  async copy(src: string, dest: string): Promise<void> {
    // Implementation
  }
  
  // Private methods last
  private async validatePath(path: string): Promise<void> {
    // Implementation
  }
}
```

### Documentation Standards

```typescript
/**
 * Copy a file from source to destination with optional transformation.
 * 
 * @param src - Source file path
 * @param dest - Destination file path
 * @param options - Copy options
 * @param options.overwrite - Whether to overwrite existing files
 * @param options.transform - Optional transformation function
 * @returns Promise that resolves when copy is complete
 * 
 * @example
 * ```typescript
 * await shell.copy('input.txt', 'output.txt', {
 *   overwrite: true,
 *   transform: (content) => content.toUpperCase()
 * });
 * ```
 */
async copy(
  src: string, 
  dest: string, 
  options: CopyOptions = {}
): Promise<void>
```

## 🐛 Bug Reports

### Before Reporting

1. **Search existing issues** to avoid duplicates
2. **Test with latest version** to ensure bug still exists
3. **Create minimal reproduction** to isolate the issue

### Bug Report Template

```markdown
**Bug Description**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Create shell with config '...'
2. Call method '....'
3. See error

**Expected Behavior**
A clear description of what you expected to happen.

**Actual Behavior**
What actually happened, including full error messages.

**Environment**
- OS: [e.g. Windows 11, macOS 13, Ubuntu 20.04]
- Node.js version: [e.g. 18.17.0] 
- @oxog/shell-core version: [e.g. 1.0.0]
- Shell/Terminal: [e.g. PowerShell, bash, zsh]

**Code Sample**
```javascript
// Minimal code that reproduces the issue
import { createShell } from '@oxog/shell-core';
const shell = createShell();
await shell.problematicMethod();
```

**Additional Context**
Any other context about the problem.
```

## 💡 Feature Requests

### Feature Request Template

```markdown
**Feature Summary**
Brief description of the feature you're proposing.

**Problem Statement**
What problem does this feature solve? What use case does it enable?

**Proposed Solution**
Describe your preferred solution. Include API design if applicable.

**API Design Example**
```javascript
// Show how the feature would be used
await shell.newFeature({
  option1: 'value1',
  option2: true
});
```

**Alternatives Considered**
What other solutions did you consider?

**Implementation Ideas**
If you have ideas about implementation, share them here.
```

## 🔧 Pull Request Process

### PR Guidelines

1. **Link to issue**: Reference the issue your PR addresses
2. **Clear description**: Explain what changes you made and why
3. **Add tests**: Include tests for new functionality
4. **Update docs**: Update README, examples, or JSDoc as needed
5. **Follow conventions**: Match existing code style and patterns

### PR Template

```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 Documentation update
- [ ] 🧪 Test improvements
- [ ] 🎨 Code style/formatting
- [ ] ♻️ Refactoring (no functional changes)

## How Has This Been Tested?
Describe the tests that you ran to verify your changes.

## Checklist
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
```

### PR Review Process

1. **Automated Checks**: CI will run tests, linting, and type checking
2. **Code Review**: Maintainers will review your code
3. **Feedback**: Address any requested changes
4. **Approval**: Once approved, your PR will be merged
5. **Release**: Changes are included in the next release

## 🏗️ Architecture Guidelines

### Design Principles

1. **Zero Dependencies**: Keep the core library dependency-free
2. **Cross-Platform**: Ensure compatibility across Windows, macOS, Linux
3. **TypeScript First**: Provide excellent TypeScript experience
4. **Performance**: Optimize for speed and memory efficiency
5. **Reliability**: Handle errors gracefully with proper recovery
6. **Extensibility**: Support plugins and customization

### Adding New Features

When adding new features, consider:

- **API Consistency**: Follow existing patterns
- **Error Handling**: Use ShellError for consistent error reporting  
- **Configuration**: Support relevant options
- **Testing**: Include comprehensive test coverage
- **Documentation**: Add JSDoc comments and examples
- **Performance**: Consider impact on performance
- **Cross-Platform**: Test on multiple platforms

## 📚 Documentation

### Types of Documentation

- **README.md**: Main library documentation
- **API Documentation**: JSDoc comments in code
- **Examples**: Real-world usage patterns
- **CHANGELOG.md**: Version history
- **Contributing Guide**: This file

### Documentation Standards

- **Clear Examples**: Show practical usage
- **Complete API Coverage**: Document all public methods  
- **Error Scenarios**: Explain error conditions
- **Performance Notes**: Mention performance characteristics
- **Cross-References**: Link related functionality

## 🎖️ Recognition

Contributors are recognized in:

- **CHANGELOG.md**: Feature and bug fix credits
- **README.md**: Contributor badges and links
- **GitHub**: Contributor graphs and stats
- **Releases**: Recognition in release notes

## 📞 Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and community chat
- **Code Review**: For implementation guidance

## 👥 Community

Join our growing community:

- ⭐ **Star the repo** to show support
- 👁️ **Watch for updates** to stay informed
- 🍴 **Fork and contribute** to help improve the project
- 📢 **Share your experience** with others

## 👤 Maintainers

**Ersin KOÇ** - *Founder & Lead Maintainer*
- GitHub: [@ersinkoc](https://github.com/ersinkoc)
- Project: [shell-core](https://github.com/ersinkoc/shell-core)

## 📄 License

By contributing to @oxog/shell-core, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to @oxog/shell-core!** 🎉

*Together, we're building the best shell operations library for Node.js.*