export const parseAlgorithmExplanation = (filePath, content, fileName) => {
  const timeComplexityMatch = content.match(/(?:Time [Cc]omplexity|O\s*\(\s*[a-zA-Z0-9^ \+\-\*\/]+\s*\))/i);
  const spaceComplexityMatch = content.match(/(?:Space [Cc]omplexity|O\s*\(\s*[a-zA-Z0-9^ \+\-\*\/]+\s*\))/i);
  
  const functions = [];
  // Match standard, async, or generator functions (with optional export prefix)
  const functionRegex = /(?:export\s+)?(?:async\s+)?function\s*\*?\s*([a-zA-Z0-9_$]+)/g;
  let match;
  while ((match = functionRegex.exec(content)) !== null) {
    functions.push(match[1]);
  }
  
  // Match arrow functions (with optional async, export prefix, and line breaks)
  const varRegex = /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)?\s*=>/g;
  while ((match = varRegex.exec(content)) !== null) {
    functions.push(match[1]);
  }
  
  // Match classes
  const classRegex = /(?:export\s+)?class\s+([a-zA-Z0-9_$]+)/g;
  while ((match = classRegex.exec(content)) !== null) {
    functions.push(match[1]);
  }

  // Determine exports (including default, named, and inline exports)
  const exports = [];
  
  // 1. export default [function/class] name
  const exportDefaultMatch = content.match(/export\s+default\s+(?:function|class)?\s*\*?\s*([a-zA-Z0-9_$]+)/);
  if (exportDefaultMatch) {
    exports.push(exportDefaultMatch[1]);
  }
  
  // 2. export { name1, name2 }
  const exportNamedMatch = content.match(/export\s*\{\s*([a-zA-Z0-9_$,\s]+)\}/);
  if (exportNamedMatch) {
    const names = exportNamedMatch[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
    exports.push(...names);
  }
  
  // 3. Inline exports like: export const x = ... or export function x()
  const inlineExportFnRegex = /export\s+(?:async\s+)?function\s*\*?\s*([a-zA-Z0-9_$]+)/g;
  while ((match = inlineExportFnRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }
  const inlineExportVarRegex = /export\s+(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=/g;
  while ((match = inlineExportVarRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }

  const cleanFnName = (name) => name.replace('Class: ', '').trim();
  let primaryFn = exports.length > 0 ? cleanFnName(exports[0]) : '';
  if (!primaryFn) {
    primaryFn = functions.length > 0 ? cleanFnName(functions[0]) : fileName.replace(/\.[^/.]+$/, "").trim();
  }

  return { 
    primaryFn, 
    functions,
    timeComplexity: timeComplexityMatch ? timeComplexityMatch[0] : 'O(N) typical',
    spaceComplexity: spaceComplexityMatch ? spaceComplexityMatch[0] : 'O(1) auxiliary'
  };
};

export const injectTraceLogsToCode = (code, fnName) => {
  const lines = code.split('\n');
  const processedLines = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      return line;
    }
    
    let newLine = line;
    if (trimmed.startsWith('for ') || trimmed.startsWith('for(') || trimmed.startsWith('while ') || trimmed.startsWith('while(')) {
      if (newLine.includes('{')) {
        newLine = newLine.replace('{', '{\n  console.log("  🔄 [LOOP] Iterasi perulangan...");');
      }
    }
    
    return newLine;
  });

  let traced = processedLines.join('\n');
  
  // Inject at function start (support standard, async, generator, and arrow functions)
  const fnRegex = new RegExp(`((?:async\\s+)?function\\s*\\*?\\s*${fnName}\\s*\\([^)]*\\)\\s*\\{)`, 'g');
  traced = traced.replace(fnRegex, 
    `$1\n  console.log("📥 [INPUT] ${fnName}() dipanggil dengan argumen:", Array.from(arguments));`
  );
  
  const arrowRegex = new RegExp(`((?:const|let|var)\\s+${fnName}\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[a-zA-Z0-9_$]+)?\\s*=>\\s*\\{)`, 'g');
  traced = traced.replace(arrowRegex, 
    `$1\n  console.log("📥 [INPUT] ${fnName}() dipanggil dengan argumen:", Array.from(arguments));`
  );

  const wrapper = `

// ==========================================
// PELACAK EKSEKUSI OTOMATIS (WRAPPER)
// ==========================================
try {
  console.log("\\n--- MEMULAI SIMULASI ALGORITMA ---");
  if (typeof ${fnName} === 'function') {
    const testInput = [1, 2, 3];
    console.log("📥 [INPUT] Memanggil ${fnName} dengan:", JSON.stringify(testInput));
    const finalResult = ${fnName}(testInput);
    console.log("🏆 [SELESAI] Hasil Akhir ${fnName}:", JSON.stringify(finalResult));
  }
} catch (e) {
  console.log("Catatan: Silakan sesuaikan parameter pemanggilan ${fnName}() di bawah jika diperlukan.");
}
`;
  return traced + wrapper;
};
