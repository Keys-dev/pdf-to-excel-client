import { useState, useCallback, useMemo } from "react";
import type { LayoutCell, PageLayout, LayoutExportCell } from "../lib/api";
import { exportLayoutToExcel, exportLayoutToWord } from "../lib/api";

/**
 * LayoutView renders extracted text items at their original PDF positions,
 * preserving the document layout. Each cell shows its (row, col) coordinates
 * on hover and can be individually selected — like picking cells on a matrix.
 * Supports cell merging and exporting selected cells.
 * Selection state is managed externally (App.tsx) so it persists across re-renders.
 */

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

interface Props {
  layout?: PageLayout[];
  fileName?: string;
  selectedCells: Set<string>;
  setSelectedCells: (cells: Set<string>) => void;
  mergedCells: Map<string, MergedCellData>;
  setMergedCells: (cells: Map<string, MergedCellData>) => void;
}

export function LayoutView({ layout, fileName, selectedCells, setSelectedCells, mergedCells, setMergedCells }: Props) {
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  if (!layout || layout.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-400">
        No layout data available.
      </div>
    );
  }

  // Build a flat map of all original cells keyed by "page-row-col"
  const allCellsMap = useMemo(() => {
    const map = new Map<string, LayoutCell & { page: number }>();
    for (const page of layout) {
      for (const cell of page.cells) {
        const key = cellKey(page.page, cell.row, cell.col);
        map.set(key, { ...cell, page: page.page });
      }
    }
    return map;
  }, [layout]);

  const toggleCell = useCallback((key: string) => {
    const next = new Set(selectedCells);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedCells(next);
  }, [selectedCells, setSelectedCells]);

  const clearSelection = () => setSelectedCells(new Set());

  const selectAll = () => {
    const all = new Set<string>();
    for (const page of layout) {
      for (const cell of page.cells) {
        const key = cellKey(page.page, cell.row, cell.col);
        // Don't select cells that are already part of a merge group
        if (!isMergedInto(key, mergedCells)) {
          all.add(key);
        }
      }
    }
    setSelectedCells(all);
  };

  // Merge selected cells into one
  const mergeSelected = useCallback(() => {
    if (selectedCells.size < 2) return;

    // Gather the selected cell data
    const selected = Array.from(selectedCells)
      .map((key) => allCellsMap.get(key))
      .filter(Boolean) as (LayoutCell & { page: number })[];

    if (selected.length < 2) return;

    // Group by page
    const byPage = new Map<number, (LayoutCell & { page: number })[]>();
    for (const cell of selected) {
      const existing = byPage.get(cell.page) || [];
      existing.push(cell);
      byPage.set(cell.page, existing);
    }

    const newMerged = new Map(mergedCells);

    for (const [page, cells] of byPage) {
      // Compute bounding box
      const minX = Math.min(...cells.map((c) => c.x));
      const minY = Math.min(...cells.map((c) => c.y));
      const maxX = Math.max(...cells.map((c) => c.x + c.w));
      const maxY = Math.max(...cells.map((c) => c.y + c.h));

      // Sort cells by row then col for text order
      const sorted = [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
      const mergedText = sorted.map((c) => c.text).join(" ");

      const mergedKey = `merged-${page}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      newMerged.set(mergedKey, {
        key: mergedKey,
        page,
        text: mergedText,
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
        row: Math.min(...cells.map((c) => c.row)),
        col: Math.min(...cells.map((c) => c.col)),
        originalKeys: cells.map((c) => cellKey(page, c.row, c.col)),
      });
    }

    setMergedCells(newMerged);
    setSelectedCells(new Set());
  }, [selectedCells, allCellsMap, mergedCells]);

  // Unmerge a merged cell (restore original cells)
  const unmergeCell = useCallback((mergedKey: string) => {
    const next = new Map(mergedCells);
    next.delete(mergedKey);
    setMergedCells(next);
  }, [mergedCells, setMergedCells]);

  // Collect all selected cell info for the summary panel
  const selectedInfo: { page: number; row: number; col: number; text: string }[] = [];
  for (const page of layout) {
    for (const cell of page.cells) {
      const key = cellKey(page.page, cell.row, cell.col);
      if (selectedCells.has(key)) {
        selectedInfo.push({ page: page.page, row: cell.row, col: cell.col, text: cell.text });
      }
    }
  }

  // Build layout export cells from selected + merged cells — includes row/col for table export
  const buildExportCells = useCallback((): LayoutExportCell[] => {
    const cells: LayoutExportCell[] = [];

    // Add selected original cells
    for (const page of layout) {
      for (const cell of page.cells) {
        const key = cellKey(page.page, cell.row, cell.col);
        if (selectedCells.has(key)) {
          cells.push({
            text: cell.text,
            x: cell.x,
            y: cell.y,
            w: cell.w,
            h: cell.h,
            page: page.page,
            row: cell.row,
            col: cell.col,
          });
        }
      }
    }

    // Add merged cells
    for (const merged of mergedCells.values()) {
      cells.push({
        text: merged.text,
        x: merged.x,
        y: merged.y,
        w: merged.w,
        h: merged.h,
        page: merged.page,
        row: merged.row,
        col: merged.col,
      });
    }

    return cells;
  }, [layout, selectedCells, mergedCells]);

  const hasSelection = selectedCells.size > 0 || mergedCells.size > 0;

  return (
    <div className="space-y-6">
      {/* ── Selection toolbar (sticky) ──────────────────────────── */}
      <div className="sticky top-0 z-30 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700">Layout View</span>
            <span className="text-xs text-slate-400">
              Click cells to select · Select multiple to merge · Hover for coordinates
            </span>
          </div>
          <div className="flex items-center gap-3">
            {hasSelection && (
              <span className="text-xs font-medium text-blue-600 tabular-nums">
                {selectedCells.size} cell{selectedCells.size !== 1 ? "s" : ""} selected
                {mergedCells.size > 0 && `, ${mergedCells.size} merged`}
              </span>
            )}
            <button
              onClick={selectAll}
              className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors"
            >
              Select all
            </button>
            <button
              onClick={clearSelection}
              className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors"
            >
              Clear
            </button>
            {selectedCells.size >= 2 && (
              <button
                onClick={mergeSelected}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
              >
                Merge ({selectedCells.size})
              </button>
            )}
            {hasSelection && (
              <>
                <button
                  onClick={() => exportLayoutToExcel(buildExportCells())}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
                >
                  Export Excel
                </button>
                <button
                  onClick={() => exportLayoutToWord(buildExportCells(), fileName ?? "extracted")}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                >
                  Export Word
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Selected cells summary ──────────────────────────────── */}
      {(selectedInfo.length > 0 || mergedCells.size > 0) && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 px-5 py-3">
          <p className="text-xs font-medium text-blue-700 mb-2">
            Selected Cells ({selectedInfo.length + mergedCells.size})
          </p>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {selectedInfo.map((info, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[10px] font-mono"
                title={`"${info.text}"`}
              >
                p{info.page}[{info.row},{info.col}]
              </span>
            ))}
            {Array.from(mergedCells.values()).map((m) => (
              <span
                key={m.key}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 text-[10px] font-mono"
                title={`"${m.text}" (merged from ${m.originalKeys.length} cells)`}
              >
                p{m.page}[{m.row},{m.col}] ⚡
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Page layouts ────────────────────────────────────────── */}
      {layout.map((page) => (
        <LayoutPage
          key={page.page}
          page={page}
          selectedCells={selectedCells}
          hoveredCell={hoveredCell}
          mergedCells={mergedCells}
          onToggleCell={toggleCell}
          onHoverCell={setHoveredCell}
          onUnmergeCell={unmergeCell}
        />
      ))}
    </div>
  );
}

function cellKey(page: number, row: number, col: number): string {
  return `${page}-${row}-${col}`;
}

/** Check whether a cell key is part of any merged group */
function isMergedInto(key: string, mergedCells: Map<string, MergedCellData>): boolean {
  for (const m of mergedCells.values()) {
    if (m.originalKeys.includes(key)) return true;
  }
  return false;
}

interface LayoutPageProps {
  page: PageLayout;
  selectedCells: Set<string>;
  hoveredCell: string | null;
  mergedCells: Map<string, MergedCellData>;
  onToggleCell: (key: string) => void;
  onHoverCell: (key: string | null) => void;
  onUnmergeCell: (mergedKey: string) => void;
}

function LayoutPage({ page, selectedCells, hoveredCell, mergedCells, onToggleCell, onHoverCell, onUnmergeCell }: LayoutPageProps) {
  // Collect merged cells for this page
  const pageMerged = Array.from(mergedCells.values()).filter((m) => m.page === page.page);

  // Build a set of original cell keys that are hidden (merged into a group on this page)
  const hiddenKeys = new Set<string>();
  for (const m of pageMerged) {
    for (const k of m.originalKeys) {
      hiddenKeys.add(k);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
        <span className="text-xs font-semibold text-slate-600">
          Page {page.page}
        </span>
        <span className="text-[10px] text-slate-400 tabular-nums">
          {page.rowCount} rows × {page.colCount} cols · {page.cells.length} cells
          {pageMerged.length > 0 && ` · ${pageMerged.length} merged`}
        </span>
      </div>

      {/* Page canvas — A4 aspect ratio (1 : 1.414), wider canvas */}
      <div
        className="relative mx-auto"
        style={{
          aspectRatio: "1 / 1.414",
          maxWidth: "95vw",
          width: "100%",
        }}
      >
        {/* Row number labels — left side */}
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: page.rowCount }, (_, ri) => {
            // Estimate row y position from cells in that row
            const rowCells = page.cells.filter((c) => c.row === ri);
            if (rowCells.length === 0) return null;
            const avgY = rowCells.reduce((s, c) => s + c.y, 0) / rowCells.length;
            return (
              <div
                key={`row-${ri}`}
                className="absolute left-0 text-[9px] font-mono text-slate-300 select-none"
                style={{ top: `${avgY}%`, transform: "translateY(-50%)" }}
              >
                <span className="bg-white px-0.5">{ri}</span>
              </div>
            );
          })}
        </div>

        {/* Original cells */}
        {page.cells.map((cell) => {
          const key = cellKey(page.page, cell.row, cell.col);
          const isHidden = hiddenKeys.has(key);
          const isSelected = selectedCells.has(key);
          const isHovered = hoveredCell === key;

          if (isHidden) {
            // Render hidden (merged) cells as invisible placeholders
            return (
              <div
                key={key}
                className="absolute pointer-events-none"
                style={{
                  left: `${cell.x}%`,
                  top: `${cell.y}%`,
                  width: `${Math.max(cell.w, 1)}%`,
                }}
              />
            );
          }

          return (
            <button
              key={key}
              onClick={() => onToggleCell(key)}
              onMouseEnter={() => onHoverCell(key)}
              onMouseLeave={() => onHoverCell(null)}
              title={`Row: ${cell.row}, Col: ${cell.col}\n"${cell.text}"`}
              className={`absolute text-left transition-all duration-75 cursor-pointer group
                ${isSelected ? "z-10" : "z-0"}
              `}
              style={{
                left: `${cell.x}%`,
                top: `${cell.y}%`,
                width: `${Math.max(cell.w, 1)}%`,
                minWidth: "24px",
              }}
            >
              {/* Selection highlight */}
              <div
                className={`absolute inset-0 rounded transition-all duration-75
                  ${isSelected
                    ? "bg-blue-200/60 ring-2 ring-blue-400"
                    : isHovered
                    ? "bg-blue-100/40 ring-1 ring-blue-300"
                    : "bg-transparent"
                  }
                `}
              />

              {/* Coordinate badge — shown on hover or when selected */}
              {(isSelected || isHovered) && (
                <div className="absolute -top-4 left-0 z-20 flex items-center gap-0.5">
                  <span className={`px-1 py-0.5 rounded text-[9px] font-mono font-bold shadow-sm ${
                    isSelected
                      ? "bg-blue-500 text-white"
                      : "bg-slate-500 text-white"
                  }`}>
                    [{cell.row},{cell.col}]
                  </span>
                </div>
              )}

              {/* Cell text */}
              <span
                className={`relative block px-1 py-0.5 text-xs leading-tight
                  ${isSelected ? "text-blue-800 font-medium" : "text-slate-700"}
                `}
              >
                {cell.text || "\u00A0"}
              </span>
            </button>
          );
        })}

        {/* Merged cells */}
        {pageMerged.map((merged) => {
          const isHovered = hoveredCell === merged.key;
          return (
            <div
              key={merged.key}
              onMouseEnter={() => onHoverCell(merged.key)}
              onMouseLeave={() => onHoverCell(null)}
              className={`absolute z-20 group cursor-pointer`}
              style={{
                left: `${merged.x}%`,
                top: `${merged.y}%`,
                width: `${Math.max(merged.w, 1)}%`,
                minWidth: "30px",
              }}
              title={`Merged cell [${merged.row},${merged.col}]\n"${merged.text}"\n(${merged.originalKeys.length} cells merged)\nClick ✕ to unmerge`}
            >
              {/* Merged cell highlight */}
              <div className="absolute inset-0 rounded bg-purple-200/50 ring-2 ring-purple-400" />

              {/* Unmerge button */}
              <button
                onClick={(e) => { e.stopPropagation(); onUnmergeCell(merged.key); }}
                className="absolute -top-2 -right-2 z-30 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-600"
                title="Unmerge"
              >
                ✕
              </button>

              {/* Coordinate badge */}
              {(isHovered) && (
                <div className="absolute -top-5 left-0 z-20 flex items-center gap-0.5">
                  <span className="px-1 py-0.5 rounded text-[9px] font-mono font-bold shadow-sm bg-purple-500 text-white">
                    [{merged.row},{merged.col}] ⚡
                  </span>
                </div>
              )}

              {/* Merged cell text */}
              <span className="relative block px-1 py-0.5 text-xs leading-tight text-purple-800 font-medium">
                {merged.text || "\u00A0"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
