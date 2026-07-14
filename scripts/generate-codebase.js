import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, '../src/algorithms');
const OUTPUT_FILE = path.resolve(__dirname, '../src/codebase.json');

const EXCLUDED_DIRS = new Set([
  '.git',
  '.github',
  '.husky',
  'node_modules',
  'platform',
  '_bmad',
  '_bmad-output',
  'docs',
  'scripts'
]);

function buildTreeAndFiles(dirPath, relativeDir = '') {
  const items = fs.readdirSync(dirPath);
  const treeNodes = [];
  const filesMap = {};

  for (const item of items) {
    if (EXCLUDED_DIRS.has(item)) continue;

    const fullPath = path.join(dirPath, item);
    const relativePath = path.join(relativeDir, item).replace(/\\/g, '/');
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      const { tree: children, files: childFiles } = buildTreeAndFiles(fullPath, relativePath);
      if (children.length > 0 || Object.keys(childFiles).length > 0) {
        treeNodes.push({
          name: item,
          type: 'directory',
          path: relativePath,
          children: children.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name);
          })
        });
        Object.assign(filesMap, childFiles);
      }
    } else if (stat.isFile() && (item.endsWith('.js') || item.endsWith('.ts') || item.endsWith('.md'))) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      
      // Try parsing description from comments
      let description = '';
      const docMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
      if (docMatch) {
        description = docMatch[1]
          .split('\n')
          .map(line => line.replace(/^\s*\*\s?/, ''))
          .join('\n')
          .trim();
      }

      const fileObj = {
        name: item,
        path: relativePath,
        content: content,
        description: description || `Algorithm implemented in ${item.endsWith('.js') ? 'JavaScript' : 'TypeScript'}.`
      };

      filesMap[relativePath] = fileObj;
      treeNodes.push({
        name: item,
        type: 'file',
        path: relativePath
      });
    }
  }

  return { tree: treeNodes, files: filesMap };
}

console.log('Scanning codebase starting from:', WORKSPACE_ROOT);
const { tree, files } = buildTreeAndFiles(WORKSPACE_ROOT);

const result = {
  tree: tree.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  }),
  files
};

// Ensure src directory exists
const outputDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf-8');
console.log(`Successfully generated ${OUTPUT_FILE} with ${Object.keys(files).length} files.`);
