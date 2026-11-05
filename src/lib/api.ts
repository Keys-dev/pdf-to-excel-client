export interface TableConfidence {
  score: number;
  columnConsistency: number;
  rowSpacingRegularity: number;
  fromMarkup: boolean;
}

export interface ExtractedTable {
  page: number;
  rows: string[][];
  confidence?: TableConfidence;
}

/** A single text item with its position on the page (percentages) */
export interface LayoutCell {
  text: string;
  /** Left edge as % of page width */
  x: number;
  /** Top edge as % of page height */
  y: number;
  /** Width as % of page width */
  w: number;
  /** Height as % of page height */
  h: number;
  /** Row index for coordinate display */
  row: number;
  /** Column index for coordinate display */
  col: number;
}

/** One page worth of layout cells */
export interface PageLayout {
  page: number;
  cells: LayoutCell[];
  rowCount: number;
  colCount: number;
}

export interface ExtractionResult {
  fileName: string;
  pageCount: number;
  tables: ExtractedTable[];
  rawText: string;
  /** Per-page layout data preserving original text positions */
  layout?: PageLayout[];
}

/** A cell with its layout position for layout-preserving export */
export interface LayoutExportCell {
  text: string;
  /** Left edge as % of page width (0–100) */
  x: number;
  /** Top edge as % of page height (0–100) */
  y: number;
  /** Width as % of page width (0–100) */
  w: number;
  /** Height as % of page height (0–100) */
  h: number;
  /** 1-based page number */
  page: number;
  /** Row index in the detected table grid */
  row?: number;
  /** Column index in the detected table grid */
  col?: number;
}

// Use VITE_API_URL if set (for production), otherwise fall back to /api (proxied locally)
const API_BASE = import.meta.env.VITE_API_URL || "/api";

export async function extractPdf(file: File): Promise<ExtractionResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/extract`, { method: "POST", body: formData });
  if (!res.ok) throw new Error((await res.json()).error ?? "Extraction failed");
  return res.json();
}

async function downloadExport(path: string, body: unknown, filename: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Export failed");

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportLayoutToExcel(cells: LayoutExportCell[]) {
  return downloadExport("/export/excel-layout", { cells }, "extracted-layout.xlsx");
}

export function exportLayoutToWord(cells: LayoutExportCell[], fileName: string) {
  return downloadExport("/export/word-layout", { cells, fileName }, "extracted-layout.docx");
}
