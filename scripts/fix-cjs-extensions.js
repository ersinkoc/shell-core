import { readdir, readFile, writeFile } from 'fs/promises';
import { join, extname } from 'path';

async function fixCjsExtensions(dir) {
  const files = await readdir(dir, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = join(dir, file.name);
    
    if (file.isDirectory()) {
      await fixCjsExtensions(fullPath);
    } else if (extname(file.name) === '.js') {
      const content = await readFile(fullPath, 'utf-8');
      
      // Fix import/export statements to use .cjs extensions for local modules
      const fixedContent = content
        .replace(/from '(\.[^']+)'/g, (match, path) => {
          if (!path.endsWith('.js') && !path.includes('/')) {
            return `from '${path}.cjs'`;
          }
          return match.replace('.js', '.cjs');
        })
        .replace(/import\('(\.[^']+)'\)/g, (match, path) => {
          if (!path.endsWith('.js') && !path.includes('/')) {
            return `import('${path}.cjs')`;
          }
          return match.replace('.js', '.cjs');
        });
      
      if (fixedContent !== content) {
        await writeFile(fullPath, fixedContent);
      }
      
      // Rename the file to .cjs
      const cjsPath = fullPath.replace(/\.js$/, '.cjs');
      await writeFile(cjsPath, fixedContent);
      await readFile(fullPath).then(() => {
        // Only remove original if cjs was written successfully
        import('fs').then(fs => fs.unlinkSync(fullPath));
      });
    }
  }
}

fixCjsExtensions('./dist/cjs').catch(console.error);