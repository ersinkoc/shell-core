#!/usr/bin/env node

/**
 * @oxog/shell-core - Build Automation Example
 * 
 * This example demonstrates how to create automated build scripts using shell-core:
 * - Project building with TypeScript
 * - Asset processing and optimization
 * - Testing and quality checks
 * - Deployment preparation
 * - Transaction-based operations with rollback
 * 
 * Author: Ersin KOÇ
 * Repository: https://github.com/ersinkoc/shell-core
 */

import { createShell } from '@oxog/shell-core';
import { join } from 'path';
import { tmpdir } from 'os';

class ProjectBuilder {
  constructor() {
    this.shell = createShell({
      verbose: true,
      fatal: false // Don't exit on errors, we'll handle them
    });
    
    this.config = {
      srcDir: 'src',
      distDir: 'dist',
      assetsDir: 'assets',
      testDir: 'test',
      nodeModulesDir: 'node_modules'
    };
  }
  
  async cleanBuild() {
    console.log('🧹 Cleaning previous build...');
    
    await this.shell.remove(this.config.distDir, { recursive: true, force: true });
    await this.shell.mkdir(this.config.distDir, { recursive: true });
    
    console.log('✅ Build directory cleaned');
  }
  
  async installDependencies() {
    console.log('📦 Installing dependencies...');
    
    const result = await this.shell.exec('npm ci', { timeout: 60000 });
    
    if (result.code !== 0) {
      throw new Error(`Dependency installation failed: ${result.stderr}`);
    }
    
    console.log('✅ Dependencies installed successfully');
  }
  
  async runTests() {
    console.log('🧪 Running tests...');
    
    const testResult = await this.shell.exec('npm test', { timeout: 120000 });
    
    if (testResult.code !== 0) {
      throw new Error(`Tests failed: ${testResult.stderr}`);
    }
    
    console.log(`✅ All tests passed (${testResult.duration}ms)`);
    return testResult;
  }
  
  async lintCode() {
    console.log('🔍 Running code linting...');
    
    const lintResult = await this.shell.exec('npm run lint', { timeout: 30000 });
    
    if (lintResult.code !== 0) {
      console.warn(`⚠️ Linting issues found: ${lintResult.stdout}`);
      // Don't fail build for linting issues, just warn
    } else {
      console.log('✅ Code linting passed');
    }
    
    return lintResult;
  }
  
  async compileTypeScript() {
    console.log('🔧 Compiling TypeScript...');
    
    const tscResult = await this.shell.exec('npx tsc', { timeout: 60000 });
    
    if (tscResult.code !== 0) {
      throw new Error(`TypeScript compilation failed: ${tscResult.stderr}`);
    }
    
    console.log('✅ TypeScript compilation completed');
    return tscResult;
  }
  
  async processAssets() {
    console.log('🎨 Processing assets...');
    
    // Copy static assets
    if (await this.shell.exists(this.config.assetsDir)) {
      await this.shell.pipeline()
        .glob(`${this.config.assetsDir}/**/*`)
        .filterByType('file')
        .copyTo(join(this.config.distDir, 'assets'))
        .execute();
        
      console.log('✅ Static assets copied');
    }
    
    // Optimize images (if tools are available)
    try {
      const imageFiles = await this.shell.glob(join(this.config.distDir, '**/*.{png,jpg,jpeg,gif}'));
      if (imageFiles.length > 0) {
        console.log(`🖼️ Found ${imageFiles.length} images for optimization`);
        // Note: In a real project, you would use image optimization tools here
      }
    } catch (error) {
      console.log('ℹ️ Image optimization skipped (tools not available)');
    }
  }
  
  async minifyJavaScript() {
    console.log('📦 Minifying JavaScript...');
    
    try {
      // Check if terser is available
      await this.shell.exec('npx terser --version', { silent: true });
      
      const jsFiles = await this.shell.glob(join(this.config.distDir, '**/*.js'));
      
      if (jsFiles.length > 0) {
        await this.shell.pipeline()
          .input(jsFiles)
          .map(async (file) => {
            const result = await this.shell.exec(`npx terser ${file} -o ${file} -m -c`);
            console.log(`   Minified: ${file.split('/').pop()}`);
            return result;
          })
          .execute();
          
        console.log(`✅ Minified ${jsFiles.length} JavaScript files`);
      }
    } catch (error) {
      console.log('ℹ️ JavaScript minification skipped (terser not available)');
    }
  }
  
  async generateBuildInfo() {
    console.log('📋 Generating build information...');
    
    const buildInfo = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      buildNumber: process.env.BUILD_NUMBER || 'local',
      gitCommit: 'unknown'
    };
    
    // Try to get git commit hash
    try {
      const gitResult = await this.shell.exec('git rev-parse HEAD', { silent: true });
      if (gitResult.code === 0) {
        buildInfo.gitCommit = gitResult.stdout.trim();
      }
    } catch (error) {
      // Ignore git errors
    }
    
    await this.shell.writeFile(
      join(this.config.distDir, 'build-info.json'),
      JSON.stringify(buildInfo, null, 2)
    );
    
    console.log('✅ Build information generated');
    return buildInfo;
  }
  
  async createArchive() {
    console.log('📁 Creating deployment archive...');
    
    const archiveName = `build-${Date.now()}.tar.gz`;
    
    try {
      await this.shell.exec(`tar -czf ${archiveName} -C ${this.config.distDir} .`);
      console.log(`✅ Created archive: ${archiveName}`);
      return archiveName;
    } catch (error) {
      console.log('ℹ️ Archive creation skipped (tar not available)');
      return null;
    }
  }
  
  async performHealthCheck() {
    console.log('🩺 Performing build health check...');
    
    const checks = [];
    
    // Check if main files exist
    const mainFiles = ['index.js', 'package.json'];
    for (const file of mainFiles) {
      const exists = await this.shell.exists(join(this.config.distDir, file));
      checks.push({ file, exists });
      console.log(`   ${exists ? '✅' : '❌'} ${file}`);
    }
    
    // Check bundle size
    const stats = await this.shell.stat(this.config.distDir);
    console.log(`   📊 Build size: ${this.formatBytes(stats.size || 0)}`);
    
    const allChecksPass = checks.every(check => check.exists);
    
    if (allChecksPass) {
      console.log('✅ Health check passed');
    } else {
      throw new Error('Health check failed - missing required files');
    }
    
    return { checks, allChecksPass };
  }
  
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  async build() {
    const startTime = Date.now();
    console.log('🚀 Starting build process...');
    console.log('============================\\n');
    
    try {
      // Use transaction for atomic build process
      const result = await this.shell.transaction(async (tx) => {
        console.log('📦 Build Transaction Started');
        
        // Phase 1: Preparation
        await this.cleanBuild();
        
        // Phase 2: Dependencies and Quality
        await this.installDependencies();
        await this.runTests();
        await this.lintCode();
        
        // Phase 3: Compilation
        await this.compileTypeScript();
        
        // Phase 4: Asset Processing
        await this.processAssets();
        await this.minifyJavaScript();
        
        // Phase 5: Finalization
        const buildInfo = await this.generateBuildInfo();
        const archive = await this.createArchive();
        await this.performHealthCheck();
        
        return {
          success: true,
          buildInfo,
          archive,
          duration: Date.now() - startTime
        };
      });
      
      // Success!
      console.log('\\n🎉 Build completed successfully!');
      console.log('================================');
      console.log(`⏱️ Total time: ${result.duration}ms`);
      console.log(`🏗️ Build: ${result.buildInfo.buildNumber}`);
      console.log(`📦 Output: ${this.config.distDir}/`);
      
      if (result.archive) {
        console.log(`📁 Archive: ${result.archive}`);
      }
      
      console.log('\\n📋 Build Summary:');
      console.log(`   Platform: ${result.buildInfo.platform}`);
      console.log(`   Node.js: ${result.buildInfo.nodeVersion}`);
      console.log(`   Commit: ${result.buildInfo.gitCommit.slice(0, 8)}`);
      console.log(`   Timestamp: ${result.buildInfo.timestamp}`);
      
      return result;
      
    } catch (error) {
      console.error('\\n❌ Build failed!');
      console.error('================');
      console.error(`Error: ${error.message}`);
      console.error(`Time: ${Date.now() - startTime}ms`);
      console.log('\\n🔄 All changes have been rolled back.');
      
      throw error;
    }
  }
}

// Demo function
async function buildAutomationDemo() {
  console.log('🏗️ @oxog/shell-core - Build Automation Demo');
  console.log('============================================\\n');
  
  // Create a temporary project structure for demo
  const shell = createShell();
  const demoDir = join(tmpdir(), 'build-demo-' + Date.now());
  
  try {
    // Setup demo project structure
    console.log('📁 Setting up demo project...');
    await shell.mkdir(demoDir, { recursive: true });
    process.chdir(demoDir);
    
    // Create fake project files
    await shell.writeFile('package.json', JSON.stringify({
      name: 'demo-project',
      version: '1.0.0',
      scripts: {
        test: 'echo "Tests passed!"',
        lint: 'echo "Linting passed!"'
      }
    }, null, 2));
    
    await shell.mkdir('src', { recursive: true });
    await shell.writeFile('src/index.js', `
console.log('Hello from demo project!');
export function greet(name) {
  return \`Hello, \${name}!\`;
}
    `.trim());
    
    await shell.mkdir('assets', { recursive: true });
    await shell.writeFile('assets/style.css', 'body { margin: 0; }');
    
    console.log('✅ Demo project setup complete\\n');
    
    // Run the build
    const builder = new ProjectBuilder();
    await builder.build();
    
    console.log('\\n📚 This example demonstrates:');
    console.log('   • Transaction-based build process');
    console.log('   • Automatic rollback on failure');
    console.log('   • Pipeline operations for asset processing');  
    console.log('   • Health checks and validation');
    console.log('   • Build information generation');
    console.log('   • Error handling and recovery');
    
  } catch (error) {
    console.error('\\n❌ Demo failed:', error.message);
  } finally {
    // Cleanup
    try {
      process.chdir('..');
      await shell.remove(demoDir, { recursive: true, force: true });
      console.log('\\n🧹 Demo cleanup completed');
    } catch (cleanupError) {
      console.error('⚠️ Cleanup failed:', cleanupError.message);
    }
  }
}

// Run the demo
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  buildAutomationDemo().catch(console.error);
}