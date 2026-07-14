import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, '../../');
const DEST_ROOT = path.resolve(__dirname, '../src/algorithms');

const ALGO_DIRS = [
  'Backtracking',
  'Bit-Manipulation',
  'Cache',
  'Cellular-Automata',
  'Ciphers',
  'Compression',
  'Conversions',
  'Data-Structures',
  'Dynamic-Programming',
  'Geometry',
  'Graphs',
  'Hashes',
  'Maths',
  'Navigation',
  'Project-Euler',
  'Recursive',
  'Search',
  'Sliding-Windows',
  'Sorts',
  'String',
  'Timing-Functions',
  'Trees'
];

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  
  const items = fs.readdirSync(from);
  for (const item of items) {
    const fromPath = path.join(from, item);
    const toPath = path.join(to, item);
    
    const stat = fs.statSync(fromPath);
    if (stat.isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  }
}

console.log('Copying algorithm directories to platform/src/algorithms...');

// Clear existing dest if it exists
if (fs.existsSync(DEST_ROOT)) {
  fs.rmSync(DEST_ROOT, { recursive: true, force: true });
}
fs.mkdirSync(DEST_ROOT, { recursive: true });

for (const dir of ALGO_DIRS) {
  const srcDir = path.join(WORKSPACE_ROOT, dir);
  const destDir = path.join(DEST_ROOT, dir);
  
  if (fs.existsSync(srcDir)) {
    console.log(`Copying: ${dir} -> platform/src/algorithms/${dir}`);
    copyFolderSync(srcDir, destDir);
  } else {
    console.log(`Warning: Directory ${dir} not found in workspace root.`);
  }
}

console.log('Successfully copied all algorithm folders.');
