#!/usr/bin/env node

import { createShell } from '../dist/esm/index.js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function showHelp() {
  console.log(`
@oxog/shell-core CLI - Zero-Dependency Node.js Shell Commands

USAGE:
  oxog-shell <command> [options] [arguments]

COMMANDS:
  exec <command>              Execute a shell command
  copy <source> <dest>        Copy files or directories  
  move <source> <dest>        Move/rename files or directories
  remove <path>               Remove files or directories
  mkdir <path>                Create directories
  touch <path>                Create or update file timestamps
  grep <pattern> <files...>   Search for patterns in files
  find <pattern>              Find files matching pattern
  which <command>             Find executable in PATH
  pipeline <file>             Execute pipeline from YAML file
  
OPTIONS:
  --help, -h                  Show this help message
  --version, -v               Show version information
  --silent, -s                Silent mode (no output)
  --verbose                   Verbose mode (detailed output)
  --parallel <n>              Set parallelism level (default: 4)
  --timeout <ms>              Set command timeout (default: 30000)
  --retry <n>                 Set retry attempts (default: 3)
  --recursive, -r             Recursive operation (for copy/remove)
  --force, -f                 Force operation (ignore errors)
  --preserve, -p              Preserve timestamps/permissions
  --follow-symlinks           Follow symbolic links
  --no-clobber               Don't overwrite existing files
  --dry-run                   Show what would be done without executing
  
EXAMPLES:
  oxog-shell exec "ls -la"
  oxog-shell copy src/ dist/ --recursive --preserve
  oxog-shell remove temp/ --recursive --force
  oxog-shell grep "error" *.log --ignore-case
  oxog-shell find "**/*.js" | oxog-shell grep "TODO"
  oxog-shell pipeline build.yaml
  
For more information, visit: https://github.com/oxog/shell-core
`);
}

async function showVersion() {
  try {
    const packagePath = join(__dirname, '../package.json');
    const packageJson = JSON.parse(await readFile(packagePath, 'utf-8'));
    console.log(`@oxog/shell-core v${packageJson.version}`);
  } catch {
    console.log('@oxog/shell-core v1.0.0');
  }
}

function parseArgs(args) {
  const parsed = {
    command: null,
    args: [],
    options: {}
  };
  
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (value !== undefined) {
        parsed.options[key] = value;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        parsed.options[key] = args[++i];
      } else {
        parsed.options[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      const flags = arg.slice(1);
      for (const flag of flags) {
        switch (flag) {
          case 'h': parsed.options.help = true; break;
          case 'v': parsed.options.version = true; break;
          case 's': parsed.options.silent = true; break;
          case 'r': parsed.options.recursive = true; break;
          case 'f': parsed.options.force = true; break;
          case 'p': parsed.options.preserve = true; break;
          default:
            if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
              parsed.options[flag] = args[++i];
            } else {
              parsed.options[flag] = true;
            }
        }
      }
    } else {
      if (!parsed.command) {
        parsed.command = arg;
      } else {
        parsed.args.push(arg);
      }
    }
    i++;
  }
  
  return parsed;
}

async function executePipeline(yamlFile) {
  try {
    const content = await readFile(yamlFile, 'utf-8');
    // Simple YAML parser for basic pipeline definitions
    const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    
    const shell = createShell({ silent: false });
    
    console.log(`🔗 Executing pipeline: ${yamlFile}`);
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')) {
        const command = trimmed.slice(2);
        console.log(`⚙️  ${command}`);
        
        try {
          const result = await shell.exec(command);
          if (result.success) {
            console.log(`✅ Success`);
          } else {
            console.log(`❌ Failed with code ${result.code}`);
          }
        } catch (error) {
          console.log(`❌ Error: ${error.message}`);
        }
      }
    }
    
    console.log('🎉 Pipeline completed');
  } catch (error) {
    console.error(`❌ Pipeline failed: ${error.message}`);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    await showHelp();
    return;
  }
  
  const parsed = parseArgs(args);
  
  if (parsed.options.help) {
    await showHelp();
    return;
  }
  
  if (parsed.options.version) {
    await showVersion();
    return;
  }
  
  // Create shell with CLI options
  const shell = createShell({
    silent: parsed.options.silent || false,
    verbose: parsed.options.verbose || false,
    parallel: parseInt(parsed.options.parallel) || 4,
    timeout: parseInt(parsed.options.timeout) || 30000,
    retries: parseInt(parsed.options.retry) || 3
  });
  
  try {
    switch (parsed.command) {
      case 'exec': {
        if (parsed.args.length === 0) {
          throw new Error('exec requires a command');
        }
        const command = parsed.args.join(' ');
        const result = await shell.exec(command, {
          silent: parsed.options.silent
        });
        process.exit(result.code);
        break;
      }
      
      case 'copy': {
        if (parsed.args.length < 2) {
          throw new Error('copy requires source and destination');
        }
        const [source, dest] = parsed.args;
        await shell.copy(source, dest, {
          recursive: parsed.options.recursive,
          preserve: parsed.options.preserve,
          noClobber: parsed.options['no-clobber'],
          followSymlinks: parsed.options['follow-symlinks']
        });
        console.log(`✅ Copied ${source} to ${dest}`);
        break;
      }
      
      case 'move': {
        if (parsed.args.length < 2) {
          throw new Error('move requires source and destination');
        }
        const [source, dest] = parsed.args;
        await shell.move(source, dest, {
          noClobber: parsed.options['no-clobber']
        });
        console.log(`✅ Moved ${source} to ${dest}`);
        break;
      }
      
      case 'remove': {
        if (parsed.args.length === 0) {
          throw new Error('remove requires a path');
        }
        const path = parsed.args[0];
        await shell.remove(path, {
          recursive: parsed.options.recursive,
          force: parsed.options.force
        });
        console.log(`✅ Removed ${path}`);
        break;
      }
      
      case 'mkdir': {
        if (parsed.args.length === 0) {
          throw new Error('mkdir requires a path');
        }
        const path = parsed.args[0];
        await shell.mkdir(path, {
          recursive: true
        });
        console.log(`✅ Created directory ${path}`);
        break;
      }
      
      case 'touch': {
        if (parsed.args.length === 0) {
          throw new Error('touch requires a path');
        }
        const path = parsed.args[0];
        await shell.touch(path);
        console.log(`✅ Touched ${path}`);
        break;
      }
      
      case 'grep': {
        if (parsed.args.length < 2) {
          throw new Error('grep requires pattern and files');
        }
        const [pattern, ...files] = parsed.args;
        const results = await shell.grep(pattern, files, {
          ignoreCase: parsed.options['ignore-case']
        });
        results.forEach(line => console.log(line));
        break;
      }
      
      case 'find': {
        if (parsed.args.length === 0) {
          throw new Error('find requires a pattern');
        }
        const pattern = parsed.args[0];
        const results = await shell.find(pattern).execute(['.']);
        results.forEach(file => console.log(file));
        break;
      }
      
      case 'which': {
        if (parsed.args.length === 0) {
          throw new Error('which requires a command');
        }
        const command = parsed.args[0];
        const result = await shell.which(command);
        if (result) {
          console.log(result);
        } else {
          console.log(`${command} not found`);
          process.exit(1);
        }
        break;
      }
      
      case 'pipeline': {
        if (parsed.args.length === 0) {
          throw new Error('pipeline requires a YAML file');
        }
        const yamlFile = parsed.args[0];
        await executePipeline(yamlFile);
        break;
      }
      
      default:
        console.error(`Unknown command: ${parsed.command}`);
        console.log('Run "oxog-shell --help" for usage information');
        process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(`❌ Fatal error: ${error.message}`);
  process.exit(1);
});