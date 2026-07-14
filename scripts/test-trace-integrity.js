import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CODEBASE_FILE = path.resolve(__dirname, '../src/codebase.json');

import { parseAlgorithmExplanation, injectTraceLogsToCode } from '../src/utils/parser.js';

// Main test execution
if (!fs.existsSync(CODEBASE_FILE)) {
  console.error(`Error: codebase.json not found at ${CODEBASE_FILE}. Run generate-codebase.js first.`);
  process.exit(1);
}

const codebase = JSON.parse(fs.readFileSync(CODEBASE_FILE, 'utf-8'));
const files = codebase.files;

let passed = 0;
let failed = 0;
const failures = [];

console.log(`Starting Trace Integrity Tests on ${Object.keys(files).length} files...\n`);

for (const [filePath, fileObj] of Object.entries(files)) {
  // Skip test folders or explanation files
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.includes('test') || lowerPath.endsWith('.md')) {
    continue;
  }

  const { primaryFn, functions } = parseAlgorithmExplanation(filePath, fileObj.content, fileObj.name);

  try {
    // 1. Generate trace code
    const injectedCode = injectTraceLogsToCode(fileObj.content, primaryFn);

    // 2. Syntax validation check (creates a compiled function body to check syntax)
    // We clean import/export syntax first just like Vite sandbox does
    let cleanedCode = injectedCode;
    cleanedCode = cleanedCode.replace(/export\s*\{\s*[\s\S]*?\}\s*;?/g, '');
    cleanedCode = cleanedCode.replace(/export\s+default\s+/g, '');
    cleanedCode = cleanedCode.replace(/export\s+(const|let|var|function|class)\s+/g, '$1 ');
    cleanedCode = cleanedCode.replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"]\s*;?/g, '');
    cleanedCode = cleanedCode.replace(/import\s+['"].*?['"]\s*;?/g, '');

    // Compile check
    new Function('console', cleanedCode);
    passed++;
  } catch (err) {
    failed++;
    failures.push({
      file: filePath,
      primaryFn,
      error: `${err.name}: ${err.message}`
    });
  }
}

console.log('=================== TEST SUMMARY ===================');
console.log(`✅ Passed: ${passed} files`);
console.log(`❌ Failed: ${failed} files`);
console.log('====================================================\n');

if (failures.length > 0) {
  console.log('Failed Files Details:');
  failures.forEach((f, idx) => {
    console.log(`[${idx + 1}] File: ${f.file}`);
    console.log(`    Primary Function: ${f.primaryFn}`);
    console.log(`    Error: ${f.error}\n`);
  });
  process.exit(1);
} else {
  console.log('🎉 All files successfully passed trace injection syntax validation!');
  process.exit(0);
}
