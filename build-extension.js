import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, 'dist');

if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

const filesToCopy = [
  'manifest.json',
  'background.js',
  'content.js',
  'sidepanel.html',
  'sidepanel.js',
  'tag-storage.js',
  'styles.css'
];

const dirsToCopy = [
  'icons',
  'services',
  'extractors',
  'utils'
];

filesToCopy.forEach(file => {
  const srcPath = path.join(__dirname, file);
  const destPath = path.join(distDir, file);

  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`✓ Copied ${file}`);
  } else {
    console.warn(`⚠ Warning: ${file} not found`);
  }
});

dirsToCopy.forEach(dir => {
  const srcPath = path.join(__dirname, dir);
  const destPath = path.join(distDir, dir);

  if (fs.existsSync(srcPath)) {
    fs.mkdirSync(destPath, { recursive: true });

    const files = fs.readdirSync(srcPath);
    files.forEach(file => {
      const srcFile = path.join(srcPath, file);
      const destFile = path.join(destPath, file);

      if (fs.statSync(srcFile).isFile()) {
        fs.copyFileSync(srcFile, destFile);
      }
    });
    console.log(`✓ Copied ${dir}/ directory`);
  } else {
    console.warn(`⚠ Warning: ${dir}/ directory not found`);
  }
});

console.log('\n✅ Extension build complete! Load the "dist" folder in Chrome to test.');
