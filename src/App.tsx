import { useState, useEffect, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { 
  Folder, 
  FolderOpen, 
  FileCode, 
  Terminal as TerminalIcon, 
  BookOpen, 
  Search, 
  ChevronLeft,
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  Sparkles, 
  Cpu, 
  Clock, 
  Database,
  Code2,
  Trash2,
  Menu,
  Sun,
  Moon,
  Maximize2,
  Minimize2
} from 'lucide-react';
import codebaseData from './codebase.json';
// @ts-expect-error - parser.js is vanilla JS shared with Node test script
import { parseAlgorithmExplanation, injectTraceLogsToCode } from './utils/parser.js';

interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileNode[];
}

interface FileContent {
  name: string;
  path: string;
  content: string;
  description: string;
}

const typedCodebase = codebaseData as {
  tree: FileNode[];
  files: Record<string, FileContent>;
};

export default function App() {
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [editorContent, setEditorContent] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [terminalLogs, setTerminalLogs] = useState<{ type: 'log' | 'error' | 'system'; text: string }[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'complexity' | 'steps' | 'deep-dive'>('overview');
  const [isExecuting, setIsExecuting] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [contentSplit, setContentSplit] = useState(50); // percentage for left/right split
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [isRefMaximized, setIsRefMaximized] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollTop = terminalEndRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Set default selected file on mount
  useEffect(() => {
    // Find first available file
    const firstFile = Object.keys(typedCodebase.files)[0];
    if (firstFile) {
      handleSelectFile(firstFile);
    }
  }, []);

  const handleSelectFile = (path: string) => {
    setSelectedFilePath(path);
    setIsRefMaximized(false); // Reset maximize state when file changes
    const file = typedCodebase.files[path];
    if (file) {
      setEditorContent(file.content);
      // Auto expand parent folders
      const parts = path.split('/');
      const nextExpanded = { ...expandedFolders };
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        nextExpanded[currentPath] = true;
      }
      setExpandedFolders(nextExpanded);
    }
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const clearTerminal = () => {
    setTerminalLogs([{ type: 'system', text: 'Terminal cleared. Ready to execute code.' }]);
  };

  // Pre-process code to strip ES module imports/exports so it runs in browser sandbox
  const preprocessCode = (code: string) => {
    let processed = code;
    // Remove "export { ... }" (both single line and multi-line)
    processed = processed.replace(/export\s*\{\s*[\s\S]*?\}\s*;?/g, '');
    // Remove "export default ..."
    processed = processed.replace(/export\s+default\s+/g, '');
    // Remove "export " prefix from declarations like export const/let/var/function/class
    processed = processed.replace(/export\s+(const|let|var|function|class)\s+/g, '$1 ');
    // Remove import statements
    processed = processed.replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"]\s*;?/g, '');
    processed = processed.replace(/import\s+['"].*?['"]\s*;?/g, '');
    return processed;
  };

  // Run Code Sandbox
  const runCode = () => {
    setTerminalOpen(true); // Auto-open terminal
    setIsExecuting(true);
    const currentFile = typedCodebase.files[selectedFilePath];
    const fileName = currentFile ? currentFile.name : 'script.js';
    
    setTerminalLogs(prev => [
      ...prev,
      { type: 'system', text: `> Executing ${fileName}...` }
    ]);

    setTimeout(() => {
      const logs: { type: 'log' | 'error' | 'system'; text: string }[] = [];
      
      // Setup console mocks
      const customConsole = {
        log: (...args: any[]) => {
          logs.push({ type: 'log', text: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ') });
        },
        error: (...args: any[]) => {
          logs.push({ type: 'error', text: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ') });
        },
        warn: (...args: any[]) => {
          logs.push({ type: 'log', text: `[WARN] ` + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ') });
        },
        info: (...args: any[]) => {
          logs.push({ type: 'system', text: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ') });
        }
      };

      try {
        // Build execute function wrapping preprocessed code
        const cleanedCode = preprocessCode(editorContent);
        const runner = new Function('console', cleanedCode);
        runner(customConsole);
        
        if (logs.length === 0) {
          logs.push({ type: 'system', text: 'Code executed successfully with no console output. Try adding a console.log() at the bottom!' });
        }
      } catch (err: any) {
        logs.push({ type: 'error', text: `${err.name}: ${err.message}` });
      }

      setTerminalLogs(prev => [...prev, ...logs]);
      setIsExecuting(false);
    }, 150);
  };

  // Parse Algorithm Explanations (now wrapper for imported parser function)
  const getExplanationWithLocalState = (filePath: string, content: string) => {
    const parsed = parseAlgorithmExplanation(filePath, content, selectedFilePath ? selectedFilePath.split('/').pop() || 'script.js' : 'script.js');
    if (!parsed) return null;

    // Generate step-by-step conceptual walkthrough
    let steps: string[] = [];
    let useCase = 'Digunakan dalam pengembangan perangkat lunak umum untuk mengelola aliran data atau mengoptimalkan batas waktu pencarian.';
    let tasks = [
      'Pelajari struktur kode sumber asli yang disajikan di bawah ini.',
      'Coba tambahkan statement console.log di dalam perulangan utama pada Monaco Editor di sebelah kanan untuk melacak nilai variabel.',
      'Lakukan optimasi kode atau buat kasus uji tambahan.'
    ];

    let story = '';
    let bridge = '';
    let sampleInput = '';
    let sampleOutput = '';
    let testCodeToInject = '';
    
    const file = typedCodebase.files[filePath] || { name: 'script.js', content: '', description: '' };
    const primaryFn = parsed.primaryFn;

    if (content.includes('sort') || content.includes('Sort')) {
      steps = [
        'Iterasi melalui array atau struktur data.',
        'Bandingkan elemen-elemen berdasarkan aturan pengurutan.',
        'Tukar posisi elemen jika urutannya salah.',
        'Ulangi proses ini hingga tidak ada lagi elemen yang perlu ditukar.'
      ];
      useCase = 'Pengurutan data dalam database, optimalisasi query pencarian, persiapan data sebelum Binary Search, penyelarasan tampilan antarmuka pengguna.';
      tasks = [
        'Jalankan algoritma dan perhatikan hasil urutan data di terminal sebelah kanan.',
        'Ubah logika pengurutan pada Monaco Editor agar melakukan pengurutan secara terbalik (descending).',
        'Tambahkan variabel penghitung (counter) untuk mengukur berapa banyak perbandingan/pertukaran data yang terjadi.'
      ];
      story = 'Bayangkan Anda adalah seorang pustakawan yang mendapati tumpukan buku yang berantakan di atas meja. Pengunjung perpustakaan kesulitan mencari buku karena letaknya yang tidak berurutan. Anda ingin menyusun buku-buku tersebut berdasarkan alfabet judulnya dari A ke Z.';
      bridge = 'Sebagai developer, Anda melihat tumpukan buku sebagai sebuah Array data. Untuk mengurutkannya secara efisien, alur berpikir Anda adalah membandingkan judul buku satu per satu dengan tetangganya, lalu menukar posisinya jika judul di kiri lebih besar dari judul di kanan. Proses ini terus berulang hingga seluruh Array tersortir dengan rapi.';
      sampleInput = '[8, 3, 5, 1, 9]';
      sampleOutput = '[1, 3, 5, 8, 9]';
      testCodeToInject = `\n\n// ==========================================\n// KASUS UJI OTOMATIS (Bisa diedit & dijalankan)\n// ==========================================\nconst dataAcak = [8, 3, 5, 1, 9, 2, 7, 6, 4];\nconsole.log("Data Sebelum Diurutkan:", dataAcak);\ntry {\n  const hasil = ${primaryFn}(dataAcak);\n  console.log("Data Setelah Diurutkan:", hasil);\n} catch (e) {\n  console.log("Gagal memanggil fungsi:", e.message);\n}\n`;
    } else if (content.includes('search') || content.includes('Search')) {
      steps = [
        'Inisialisasi penunjuk pencarian (seperti low/high, atau node saat ini).',
        'Periksa apakah elemen di posisi saat ini cocok dengan nilai yang dicari.',
        'Jika cocok, kembalikan indeks atau node tersebut.',
        'Jika tidak cocok, persempit rentang pencarian dan ulangi.'
      ];
      useCase = 'Pencarian indeks database, fitur autocomplete kata sandi/kamus, sistem pencarian koordinat peta, pengambilan data key-value.';
      tasks = [
        'Ubah fungsi pencarian agar menampilkan elemen yang sedang dikunjungi di konsol terminal di setiap langkah.',
        'Tambahkan kasus pengujian untuk mencari elemen yang tidak ada di dalam array, dan lihat outputnya.',
        'Modifikasi kembalian fungsi agar mengembalikan objek lengkap dengan status pencarian.'
      ];
      story = 'Bayangkan Anda sedang mencari nomor telepon teman lama bernama "Andi" di sebuah buku telepon fisik yang sangat tebal (berisi 1.000.000 nama). Jika Anda membalik halaman satu per satu dari awal, itu akan memakan waktu berjam-jam.';
      bridge = 'Sebagai developer, alur berpikir Anda adalah efisiensi. Jika buku telepon sudah terurut, daripada mencarinya satu per satu, Anda langsung membuka halaman tengah. Jika nama Andi secara alfabet berada setelah nama di halaman tengah tersebut, Anda buang separuh buku bagian kiri dan hanya mencari di bagian kanan. Pengulangan pembagian ini membuat pencarian selesai hanya dalam hitungan detik (logarithmic time).';
      sampleInput = 'Array: [10, 20, 30, 40, 50], Target: 40';
      sampleOutput = 'Indeks: 3';
      testCodeToInject = `\n\n// ==========================================\n// KASUS UJI OTOMATIS (Bisa diedit & dijalankan)\n// ==========================================\nconst dataTerurut = [10, 23, 35, 47, 58, 62, 75, 88, 90];\nconst targetCari = 62;\nconsole.log("Mencari nilai:", targetCari, "di dalam:", dataTerurut);\ntry {\n  const hasilIndeks = ${primaryFn}(dataTerurut, targetCari);\n  console.log("Ditemukan pada indeks ke:", hasilIndeks);\n} catch (e) {\n  console.log("Gagal memanggil fungsi:", e.message);\n}\n`;
    } else if (content.includes('tree') || content.includes('Tree') || content.includes('Node')) {
      steps = [
        'Mulai dari node root.',
        'Lakukan penelusuran anak node secara rekursif atau iteratif.',
        'Lakukan aksi penelusuran (Pre-order, In-order, Post-order, atau BFS).',
        'Tangani kondisi batas (node kosong) untuk menghentikan rekursi.'
      ];
      useCase = 'Penyimpanan data hierarkis (struktur folder file, HTML DOM tree), algoritma routing jaringan, struktur parser JSON/bahasa pemrograman.';
      tasks = [
        'Masukkan beberapa node baru pada struktur pohon lalu cetak tinggi (height) pohon ke konsol terminal.',
        'Ubah fungsi penelusuran agar mencetak urutan elemen dengan metode Level-order (BFS).',
        'Buat fungsi baru untuk mencari nilai minimum atau maksimum yang tersimpan di dalam pohon.'
      ];
      story = 'Bayangkan Anda diminta membangun struktur menu navigasi sebuah website besar atau struktur folder komputer. Setiap item menu (seperti "Elektronik") dapat memiliki sub-menu ("Handphone", "Laptop"), dan sub-menu tersebut bisa memiliki sub-menu lagi.';
      bridge = 'Sebagai developer, Anda menyadari hubungan hierarkis ini paling baik direpresentasikan dengan Node dan Tree. Alur berpikir Anda adalah menciptakan sebuah objek (Node) yang menyimpan nilainya sendiri beserta daftar referensi ke node anaknya. Untuk menampilkan seluruh menu, Anda menulis fungsi penelusuran (traversal) secara rekursif yang secara otomatis mengunjungi setiap sub-menu hingga ke tingkat terdalam.';
      sampleInput = 'Node root dengan subnode';
      sampleOutput = 'Urutan kunjungan node (traversal)';
      testCodeToInject = `\n\n// ==========================================\n// KASUS UJI OTOMATIS (Bisa diedit & dijalankan)\n// ==========================================\nconsole.log("Silakan instansiasi kelas/fungsi Tree Anda di bawah ini dan uji jalankan.");\n`;
    } else {
      steps = [
        'Tangani parameter masukan dan periksa batasan input.',
        'Inisialisasi variabel status (penghitung, map, stack, atau tabel memo).',
        'Jalankan perulangan utama atau panggilan fungsi rekursif.',
        'Kembalikan hasil komputasi akhir.'
      ];
      story = 'Bayangkan Anda dihadapkan pada masalah optimasi matematika atau pemrosesan data biner di mana komputer harus memproses serangkaian input rumit secara cepat dan konsisten tanpa membuang-buang memori sistem.';
      bridge = 'Sebagai developer, alur berpikir Anda adalah mendefinisikan batasan input terlebih dahulu (base case/guard clauses), menginisialisasi penyimpanan variabel sementara, lalu memproses logika menggunakan struktur kontrol (perulangan/rekursi) yang efektif sebelum mengembalikan hasil akhir.';
      sampleInput = 'Data masukan bertipe primitif / objek';
      sampleOutput = 'Hasil kalkulasi / manipulasi data';
      testCodeToInject = `\n\n// ==========================================\n// KASUS UJI OTOMATIS (Bisa diedit & dijalankan)\n// ==========================================\ntry {\n  console.log("Menjalankan fungsi...");\n  // console.log("Hasil:", ${primaryFn}());\n} catch (e) {\n  console.log("Harap sesuaikan pemanggilan fungsi:", e.message);\n}\n`;
    }

    // Dynamic trace template selection
    let traceCodeToInject = '';
    if (content.includes('sort') || content.includes('Sort')) {
      traceCodeToInject = `// Versi Ter-Trace untuk Pembelajaran (${primaryFn}):\nfunction ${primaryFn}Traced(arr) {\n  console.log("📥 Mulai pengurutan (${primaryFn}) pada array:", JSON.stringify(arr));\n  let step = 0;\n  let arrayCopy = [...arr];\n  for (let i = 0; i < arrayCopy.length; i++) {\n    console.log("\\n🔄 Pass ke-" + (i + 1) + ":");\n    let swapped = false;\n    for (let j = 0; j < arrayCopy.length - i - 1; j++) {\n      step++;\n      console.log("  [Langkah " + step + "] Bandingkan indeks " + j + " (" + arrayCopy[j] + ") dengan indeks " + (j + 1) + " (" + arrayCopy[j + 1] + ")");\n      if (arrayCopy[j] > arrayCopy[j + 1]) {\n        console.log("    ⚠️ " + arrayCopy[j] + " > " + arrayCopy[j + 1] + " -> Tukar posisi!");\n        const temp = arrayCopy[j];\n        arrayCopy[j] = arrayCopy[j + 1];\n        arrayCopy[j + 1] = temp;\n        swapped = true;\n        console.log("    📊 Array saat ini: " + JSON.stringify(arrayCopy));\n      } else {\n        console.log("    ✅ Urutan sudah benar, tidak ada penukaran.");\n      }\n    }\n    if (!swapped) {\n      console.log("  🛑 Tidak ada elemen yang ditukar pada pass ini. Array sudah terurut!");\n      break;\n    }\n  }\n  console.log("\\n🏆 Pengurutan Selesai! Hasil Akhir:", JSON.stringify(arrayCopy));\n  return arrayCopy;\n}\n\n// Jalankan uji coba\n${primaryFn}Traced([5, 3, 8, 2, 1]);\n`;
    } else if (content.includes('search') || content.includes('Search')) {
      traceCodeToInject = `// Versi Ter-Trace untuk Pembelajaran (${primaryFn}):\nfunction ${primaryFn}Traced(arr, target) {\n  console.log("📥 Mulai pencarian (${primaryFn}) untuk nilai " + target + " di dalam array:", JSON.stringify(arr));\n  let steps = 0;\n  let low = 0;\n  let high = arr.length - 1;\n  \n  while (low <= high) {\n    steps++;\n    const mid = Math.floor((low + high) / 2);\n    console.log("\\n🔄 [Langkah " + steps + "] Memeriksa indeks tengah " + mid + " (nilai: " + arr[mid] + ")");\n    console.log("   Rentang saat ini: indeks " + low + " sampai " + high);\n    \n    if (arr[mid] === target) {\n      console.log("   🎯 Nilai ditemukan di indeks " + mid + "!");\n      return mid;\n    } else if (arr[mid] < target) {\n      console.log("   ➡️ " + arr[mid] + " < " + target + " -> Persempit pencarian ke arah kanan (indeks " + (mid + 1) + " ke atas)");\n      low = mid + 1;\n    } else {\n      console.log("   ⬅️ " + arr[mid] + " > " + target + " -> Persempit pencarian ke arah kiri (indeks " + (mid - 1) + " ke bawah)");\n      high = mid - 1;\n    }\n  }\n  console.log("\\n❌ Nilai " + target + " tidak ditemukan dalam array setelah " + steps + " langkah.");\n  return -1;\n}\n\n// Jalankan uji coba\n${primaryFn}Traced([10, 20, 30, 40, 50, 60, 70, 80], 50);\n`;
    } else {
      traceCodeToInject = injectTraceLogsToCode(file.content, primaryFn);
    }

    return {
      title: file.name.replace(/\.[^/.]+$/, "").replace(/([A-Z])/g, ' $1').trim(),
      category: filePath.split('/')[0],
      description: file.description,
      timeComplexity: parsed.timeComplexity,
      spaceComplexity: parsed.spaceComplexity,
      functions: parsed.functions.length > 0 ? parsed.functions : ['defaultExport'],
      steps: steps,
      useCase,
      tasks,
      originalCode: file.content,
      story,
      bridge,
      sampleInput,
      sampleOutput,
      testCodeToInject,
      traceCodeToInject
    };
  };

  const currentExplanation = getExplanationWithLocalState(selectedFilePath, editorContent);

  // Filter out any test files or test directories, and markdown files
  const validFilePaths = Object.keys(typedCodebase.files).filter(path => {
    const lower = path.toLowerCase();
    return !lower.includes('test') && !lower.endsWith('.md');
  }).sort();

  const currentIndex = validFilePaths.indexOf(selectedFilePath);
  const prevFilePath = currentIndex > 0 ? validFilePaths[currentIndex - 1] : null;
  const nextFilePath = currentIndex < validFilePaths.length - 1 ? validFilePaths[currentIndex + 1] : null;

  const handleNextFile = () => {
    if (nextFilePath) {
      handleSelectFile(nextFilePath);
    }
  };

  const handlePrevFile = () => {
    if (prevFilePath) {
      handleSelectFile(prevFilePath);
    }
  };

  // File explorer recursive rendering
  const renderTree = (nodes: FileNode[]) => {
    return nodes.map(node => {
      const isDir = node.type === 'directory';
      const isExpanded = expandedFolders[node.path];
      const isSelected = selectedFilePath === node.path;

      // Filter logic
      if (searchQuery) {
        const matchesSearch = node.name.toLowerCase().includes(searchQuery.toLowerCase());
        const hasMatchingChild = isDir && hasMatchingChildren(node, searchQuery);
        if (!matchesSearch && !hasMatchingChild) return null;
      }

      if (isDir) {
        return (
          <div key={node.path} className="explorer-node">
            <div 
              className={`explorer-item directory ${isExpanded ? 'open' : ''}`}
              onClick={() => toggleFolder(node.path)}
            >
              <span className="chevron-icon">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <span className="folder-icon">
                {isExpanded ? <FolderOpen size={16} className="text-purple" /> : <Folder size={16} className="text-purple" />}
              </span>
              <span className="explorer-label">{node.name}</span>
            </div>
            {isExpanded && node.children && (
              <div className="explorer-children">
                {renderTree(node.children)}
              </div>
            )}
          </div>
        );
      } else {
        return (
          <div 
            key={node.path}
            className={`explorer-item file ${isSelected ? 'selected' : ''}`}
            onClick={() => handleSelectFile(node.path)}
          >
            <span className="file-icon">
              <FileCode size={15} />
            </span>
            <span className="explorer-label">{node.name}</span>
          </div>
        );
      }
    });
  };

  const hasMatchingChildren = (node: FileNode, query: string): boolean => {
    if (!node.children) return false;
    return node.children.some(child => {
      if (child.name.toLowerCase().includes(query.toLowerCase())) return true;
      if (child.type === 'directory') return hasMatchingChildren(child, query);
      return false;
    });
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="main-header">
        <div className="logo-group">
          <button 
            className="btn-sidebar-toggle" 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            <Menu size={20} />
          </button>
          <div>
            <h1>Zalshi</h1>
            <p className="subtitle">Javascript Algorithm</p>
          </div>
        </div>
        
        <div className="action-group" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button 
            className="btn-theme-toggle"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="btn btn-primary" onClick={runCode} disabled={isExecuting}>
            <span>{isExecuting ? 'Running...' : 'Run Code'}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Workspace Layout */}
      <div className="workspace">
        {/* Left Sidebar - Explorer */}
        {sidebarOpen && (
          <aside className="sidebar" style={{ width: `${sidebarWidth}px` }}>
            <div className="sidebar-search">
              <Search size={16} className="search-icon" />
              <input 
                type="text" 
                placeholder="Search algorithms..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="explorer-tree">
              <div className="explorer-header">WORKSPACE FILES</div>
              {renderTree(typedCodebase.tree)}
            </div>
          </aside>
        )}

        {/* Resizer bar between Sidebar and Main Content */}
        {sidebarOpen && (
          <div 
            className="resizer vertical"
            onMouseDown={(e) => {
              const startX = e.clientX;
              const startWidth = sidebarWidth;
              const handleMouseMove = (moveEvent: MouseEvent) => {
                const newWidth = Math.max(180, Math.min(500, startWidth + (moveEvent.clientX - startX)));
                setSidebarWidth(newWidth);
              };
              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          />
        )}

        {/* Main Content Split Area */}
        <main className="content-area">
          {/* Left Pane - Algorithm Lessons/Explanation */}
          <div className="pane left-pane" style={{ width: `${contentSplit}%` }}>
            {currentExplanation ? (
              <div className="explanation-container" style={{ position: 'relative' }}>
                <div className="algorithm-meta-header" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span className="category-tag">{currentExplanation.category}</span>
                    <h2>{currentExplanation.title}</h2>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button 
                      className="btn" 
                      onClick={handlePrevFile} 
                      disabled={!prevFilePath}
                      title="Sebelumnya"
                      style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: prevFilePath ? 'pointer' : 'default', opacity: prevFilePath ? 1 : 0.5 }}
                    >
                      <ChevronLeft size={16} />
                      <span>Prev</span>
                    </button>
                    <button 
                      className="btn btn-primary" 
                      onClick={handleNextFile} 
                      disabled={!nextFilePath}
                      title="Selanjutnya"
                      style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px', cursor: nextFilePath ? 'pointer' : 'default', opacity: nextFilePath ? 1 : 0.5 }}
                    >
                      <span>Next</span>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                <div className="explanation-tabs">
                  <button 
                    className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                  >
                    <BookOpen size={16} />
                    <span>Overview</span>
                  </button>
                  <button 
                    className={`tab-btn ${activeTab === 'complexity' ? 'active' : ''}`}
                    onClick={() => setActiveTab('complexity')}
                  >
                    <Cpu size={16} />
                    <span>Complexity</span>
                  </button>
                  <button 
                    className={`tab-btn ${activeTab === 'steps' ? 'active' : ''}`}
                    onClick={() => setActiveTab('steps')}
                  >
                    <Sparkles size={16} />
                    <span>Execution Steps</span>
                  </button>
                  <button 
                    className={`tab-btn ${activeTab === 'deep-dive' ? 'active' : ''}`}
                    onClick={() => setActiveTab('deep-dive')}
                  >
                    <Code2 size={16} />
                    <span>Deep Dive</span>
                  </button>
                </div>

                <div className="tab-content">
                  {activeTab === 'overview' && (
                    <div className="overview-tab fade-in">
                      <p className="desc-text">{currentExplanation.description}</p>
                      
                      <div className="feature-card">
                        <h3><Code2 size={16} className="card-icon" /> Exported Symbols</h3>
                        <ul>
                          {currentExplanation.functions.map((fn: string, idx: number) => (
                            <li key={idx}><code>{fn}</code></li>
                          ))}
                        </ul>
                      </div>

                      <div className="sandbox-hint">
                        <Sparkles size={16} className="text-purple animate-pulse" />
                        <p>Anda dapat mengedit kode di sebelah kanan (Monaco Editor) sebagai <strong>Playground / Sandbox</strong> Anda untuk bereksperimen, lalu tekan tombol <strong>Run Code</strong> untuk mengeksekusi dan melihat hasilnya di Terminal!</p>
                      </div>
                    </div>
                  )}

                  {activeTab === 'complexity' && (
                    <div className="complexity-tab fade-in">
                      <div className="complexity-grid">
                        <div className="complexity-card">
                          <div className="card-header">
                            <Clock size={20} className="text-purple" />
                            <h4>Time Complexity</h4>
                          </div>
                          <span className="complexity-badge time">{currentExplanation.timeComplexity}</span>
                          <p>Menentukan bagaimana waktu eksekusi bertambah seiring bertambahnya ukuran data input.</p>
                        </div>

                        <div className="complexity-card">
                          <div className="card-header">
                            <Database size={20} className="text-purple" />
                            <h4>Space Complexity</h4>
                          </div>
                          <span className="complexity-badge space">{currentExplanation.spaceComplexity}</span>
                          <p>Menentukan alokasi memori tambahan yang digunakan oleh algoritma selama eksekusi.</p>
                        </div>
                      </div>
                      
                      <div className="complexity-info-box">
                        <h5>Standard Big O Notations:</h5>
                        <ul>
                          <li><code>O(1)</code>: Constant time/space.</li>
                          <li><code>O(log N)</code>: Logarithmic scale (binary trees, divide-and-conquer).</li>
                          <li><code>O(N)</code>: Linear scale (simple iteration).</li>
                          <li><code>O(N log N)</code>: Efficient sorting (Merge sort, Heap sort).</li>
                          <li><code>O(N²)</code>: Quadratic scale (nested loops, Bubble sort).</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {activeTab === 'steps' && (
                    <div className="steps-tab fade-in">
                      <h4 className="steps-title">Conceptual Walkthrough</h4>
                      <ol className="step-list">
                        {currentExplanation.steps.map((step, idx) => (
                          <li key={idx}>
                            <span className="step-num">{idx + 1}</span>
                            <span className="step-text">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {activeTab === 'deep-dive' && (
                    <div className="deep-dive-tab fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div className="feature-card">
                        <h3><BookOpen size={16} className="card-icon" /> Jembatan Berpikir & Masalah</h3>
                        <p className="desc-text" style={{ fontStyle: 'italic', marginBottom: '12px', fontSize: '14px', lineHeight: '1.5' }}>
                          <strong>Cerita Masalah:</strong> "{currentExplanation.story}"
                        </p>
                        <p className="desc-text" style={{ marginBottom: 0, fontSize: '14.5px', lineHeight: '1.6' }}>
                          <strong>Alur Berpikir Developer:</strong> {currentExplanation.bridge}
                        </p>
                      </div>

                      <div className="feature-card">
                        <h3><Cpu size={16} className="card-icon" /> Format Input & Output</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13.5px' }}>
                          <div><strong>Input yang diharapkan:</strong> <code style={{ display: 'inline-block', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', padding: '2px 6px', borderRadius: '4px' }}>{currentExplanation.sampleInput}</code></div>
                          <div><strong>Output yang dihasilkan:</strong> <code style={{ display: 'inline-block', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', padding: '2px 6px', borderRadius: '4px' }}>{currentExplanation.sampleOutput}</code></div>
                        </div>
                      </div>

                      <div className="feature-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <h3><Clock size={16} className="card-icon" /> Tugas Belajar & Playground</h3>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              className="btn btn-primary" 
                              style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px', backgroundColor: 'var(--purple-accent)' }}
                              onClick={() => {
                                if (selectedFilePath.includes('sort') || selectedFilePath.includes('Sort') || selectedFilePath.includes('search') || selectedFilePath.includes('Search')) {
                                  setEditorContent(currentExplanation.traceCodeToInject);
                                } else {
                                  const original = typedCodebase.files[selectedFilePath]?.content;
                                  if (original) {
                                    const fnName = currentExplanation.functions[0].replace('Class: ', '');
                                    const tracedCode = injectTraceLogsToCode(original, fnName);
                                    setEditorContent(tracedCode);
                                  }
                                }
                              }}
                              title="Ganti kode di editor dengan kode pelacak langkah-demi-langkah console.log"
                            >
                              <span>Inject Trace Logs</span>
                            </button>
                            <button 
                              className="btn btn-primary" 
                              style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px' }}
                              onClick={() => {
                                setEditorContent(prev => {
                                  if (prev.includes('KASUS UJI OTOMATIS')) return prev;
                                  return prev + currentExplanation.testCodeToInject;
                                });
                              }}
                            >
                              <span>Inject Test Code</span>
                            </button>
                          </div>
                        </div>
                        <ol className="step-list" style={{ listStyle: 'none' }}>
                          {currentExplanation.tasks.map((task, idx) => (
                            <li key={idx} style={{ padding: '12px' }}>
                              <span className="step-num">{idx + 1}</span>
                              <span className="step-text" style={{ fontWeight: '500' }}>{task}</span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      <div className={`feature-card ${isRefMaximized ? 'maximized-ref-card' : ''}`} style={isRefMaximized ? {
                        position: 'absolute',
                        top: '120px', // Below the tab buttons
                        left: '24px',
                        right: '24px',
                        bottom: '24px',
                        zIndex: 50,
                        backgroundColor: 'var(--bg-secondary)',
                        margin: 0,
                        display: 'flex',
                        flexDirection: 'column'
                      } : {}}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <h3><Code2 size={16} className="card-icon" /> Kode Asli Referensi (Original Source)</h3>
                          <button 
                            className="terminal-btn"
                            onClick={() => setIsRefMaximized(!isRefMaximized)}
                            title={isRefMaximized ? "Perkecil tampilan" : "Perbesar tampilan"}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}
                          >
                            {isRefMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            <span>{isRefMaximized ? 'Restore' : 'Maximize'}</span>
                          </button>
                        </div>
                        <div style={{ height: isRefMaximized ? 'calc(100% - 40px)' : '300px', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', flex: isRefMaximized ? 1 : 'none' }}>
                          <MonacoEditor
                            height="100%"
                            language="javascript"
                            theme={theme === 'dark' ? 'vs-dark' : 'light'}
                            value={currentExplanation.originalCode}
                            options={{
                              readOnly: true,
                              minimap: { enabled: false },
                              fontSize: 13,
                              lineNumbers: 'on',
                              scrollBeyondLastLine: false,
                              automaticLayout: true,
                              wordWrap: 'on'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <BookOpen size={48} className="text-muted" />
                <p>Select a JavaScript algorithm from the VSCode explorer sidebar to generate lesson material.</p>
              </div>
            )}
          </div>

          {/* Resizer bar between Left and Right Panes */}
          <div 
            className="resizer vertical pane-resizer"
            onMouseDown={(e) => {
              const startX = e.clientX;
              const startSplit = contentSplit;
              const containerWidth = e.currentTarget.parentElement?.clientWidth || 1000;
              const handleMouseMove = (moveEvent: MouseEvent) => {
                const deltaPercent = ((moveEvent.clientX - startX) / containerWidth) * 100;
                const newSplit = Math.max(25, Math.min(75, startSplit + deltaPercent));
                setContentSplit(newSplit);
              };
              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          />

          {/* Right Pane - IDE (Monaco Editor) & Terminal Console */}
          <div className="pane right-pane" style={{ width: `${100 - contentSplit}%`, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="editor-section" style={{ height: terminalOpen ? `calc(100% - ${terminalHeight}px - 4px)` : 'calc(100% - 40px)', flex: 'none' }}>
              <div className="section-header">
                <span>IDE EDITOR - MONACO</span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {selectedFilePath && (
                    <button 
                      className="terminal-btn"
                      onClick={() => {
                        const original = typedCodebase.files[selectedFilePath]?.content;
                        if (original) setEditorContent(original);
                      }}
                      title="Reset ke kode asli"
                      style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}
                    >
                      <span>Reset Code</span>
                    </button>
                  )}
                  {selectedFilePath && <span className="filepath-badge">{selectedFilePath}</span>}
                </div>
              </div>
              <div className="editor-wrapper" style={{ height: 'calc(100% - 40px)', overflow: 'hidden' }}>
                <MonacoEditor
                  height="100%"
                  language="javascript"
                  theme={theme === 'dark' ? 'vs-dark' : 'light'}
                  value={editorContent}
                  onChange={(val) => setEditorContent(val || '')}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: 'on',
                    roundedSelection: true,
                    scrollBeyondLastLine: false,
                    readOnly: false,
                    automaticLayout: true,
                  }}
                />
              </div>
            </div>

            {/* Horizontal Resizer */}
            {terminalOpen && (
              <div 
                className="resizer horizontal"
                style={{ height: '4px', cursor: 'row-resize', backgroundColor: 'var(--border-color)', zIndex: 10 }}
                onMouseDown={(e) => {
                  const startY = e.clientY;
                  const startHeight = terminalHeight;
                  const handleMouseMove = (moveEvent: MouseEvent) => {
                    const deltaY = moveEvent.clientY - startY;
                    const newHeight = Math.max(100, Math.min(500, startHeight - deltaY));
                    setTerminalHeight(newHeight);
                  };
                  const handleMouseUp = () => {
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                  };
                  document.addEventListener('mousemove', handleMouseMove);
                  document.addEventListener('mouseup', handleMouseUp);
                }}
              />
            )}

            <div className="terminal-section" style={{ height: terminalOpen ? `${terminalHeight}px` : '40px', display: 'flex', flexDirection: 'column', flex: 'none', overflow: 'hidden' }}>
              <div className="section-header terminal-header" style={{ height: '40px', flexShrink: 0 }}>
                <div className="header-title">
                  <TerminalIcon size={16} />
                  <span>TERMINAL CONSOLE</span>
                </div>
                <div className="header-actions" style={{ display: 'flex', gap: '8px' }}>
                  <button className="terminal-btn" onClick={clearTerminal} title="Clear terminal">
                    <Trash2 size={14} />
                  </button>
                  <button className="terminal-btn" onClick={() => setTerminalOpen(!terminalOpen)} title={terminalOpen ? "Collapse terminal" : "Expand terminal"}>
                    {terminalOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                  </button>
                </div>
              </div>
              
              {terminalOpen && (
                <div className="terminal-body" ref={terminalEndRef} style={{ flex: 1, overflowY: 'auto' }}>
                  {terminalLogs.length === 0 ? (
                    <div className="terminal-line system">Terminal ready. Output will print here. Try calling console.log() in your code and running it.</div>
                  ) : (
                    terminalLogs.map((log, idx) => (
                      <div key={idx} className={`terminal-line ${log.type}`}>
                        {log.text}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
