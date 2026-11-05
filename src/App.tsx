import { useState, useCallback } from "react";
import { FileUpload } from "./components/FileUpload";
import { LayoutView } from "./components/LayoutView";
import { extractPdf, type ExtractionResult } from "./lib/api";

const STORAGE_KEY_SELECTION = "pdf2office_selectedCells";
const STORAGE_KEY_MERGED = "pdf2office_mergedCells";

/** Persist a Set to localStorage as a JSON array */
function saveSelection(cells: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY_SELECTION, JSON.stringify([...cells])); } catch { /* quota */ }
}

/** Restore a Set from localStorage */
function loadSelection(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SELECTION);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* corrupt */ }
  return new Set();
}

/** Persist merged cells map to localStorage */
function saveMerged(cells: Map<string, MergedCellData>) {
  try { localStorage.setItem(STORAGE_KEY_MERGED, JSON.stringify([...cells])); } catch { /* quota */ }
}

/** Restore merged cells map from localStorage */
function loadMerged(): Map<string, MergedCellData> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MERGED);
    if (raw) return new Map(JSON.parse(raw));
  } catch { /* corrupt */ }
  return new Map();
}

/** Merged cell data shape — matches LayoutView.MergedCellData */
interface MergedCellData {
  key: string;
  page: number;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  row: number;
  col: number;
  originalKeys: string[];
}

export default function App() {
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persistent selection state — survives re-uploads and page refreshes
  const [selectedCells, setSelectedCellsState] = useState<Set<string>>(loadSelection);
  const [mergedCells, setMergedCellsState] = useState<Map<string, MergedCellData>>(loadMerged);

  // Wrap setters to persist to localStorage automatically
  const setSelectedCells = useCallback((cells: Set<string>) => {
    setSelectedCellsState(cells);
    saveSelection(cells);
  }, []);

  const setMergedCells = useCallback((cells: Map<string, MergedCellData>) => {
    setMergedCellsState(cells);
    saveMerged(cells);
  }, []);

  const handleFile = async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await extractPdf(file);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = () => {
    setResult(null);
    setError(null);
    // Clear persistent selections when file is removed
    setSelectedCells(new Set());
    setMergedCells(new Map());
    localStorage.removeItem(STORAGE_KEY_SELECTION);
    localStorage.removeItem(STORAGE_KEY_MERGED);
  };

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      {/* Page header */}
      <h1 className="mb-1 text-3xl font-bold text-slate-900">PDF to Office</h1>
      <p className="mb-8 text-slate-500">Extract tables from a PDF and export them to Excel or Word.</p>

      <FileUpload
        onFile={handleFile}
        isLoading={isLoading}
        fileName={result?.fileName}
        onRemove={handleRemove}
        hasResult={!!result}
      />

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-5">
          {/* Results toolbar ─ file info left, remove button right */}
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* File meta */}
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800 text-sm">{result.fileName}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {result.pageCount} page{result.pageCount !== 1 ? "s" : ""} ·{" "}
                  {result.tables.length} table{result.tables.length !== 1 ? "s" : ""} detected
                </p>
              </div>

              {/* Remove button */}
              <button
                onClick={handleRemove}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                Remove file
              </button>
            </div>
          </div>

          {/* Layout view — the only view */}
          <LayoutView
            layout={result.layout}
            fileName={result.fileName}
            selectedCells={selectedCells}
            setSelectedCells={setSelectedCells}
            mergedCells={mergedCells}
            setMergedCells={setMergedCells}
          />
        </div>
      )}
    </div>
  );
}
