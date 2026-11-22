export type ParsedRow = { rowNumber: number; data: Record<string, string> };
export type ParsedTable = { headers: string[]; rows: ParsedRow[] };

/** RFC 4180 수준의 CSV/TSV 파서. 줄 번호는 원본 파일 기준(머리행 = 1)으로 남긴다. */
export function parseDelimited(text: string, delimiter: ',' | '\t' = ','): ParsedTable {
  const src = text.replace(/^﻿/, '');
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { cells.push(cell); cell = ''; }
    else if (ch === '\r') { /* \r\n 처리 */ }
    else if (ch === '\n') {
      cells.push(cell);
      records.push({ line: recordLine, cells });
      cells = []; cell = '';
      line++; recordLine = line;
    } else cell += ch;
  }
  if (cell !== '' || cells.length) { cells.push(cell); records.push({ line: recordLine, cells }); }

  const nonEmpty = records.filter((r) => r.cells.some((c) => c.trim() !== ''));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const headers = nonEmpty[0].cells.map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((r) => {
    const data: Record<string, string> = {};
    headers.forEach((h, idx) => { if (h) data[h] = (r.cells[idx] ?? '').trim(); });
    return { rowNumber: r.line, data };
  });
  return { headers, rows };
}

export function delimiterFor(name: string): ',' | '\t' | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv')) return ',';
  if (lower.endsWith('.tsv') || lower.endsWith('.txt')) return '\t';
  return null;
}
