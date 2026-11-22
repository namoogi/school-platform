import { parseDelimited } from './csv';

/**
 * 파일 판독기. 형식과 관계없이 "표 + 행 위치"로 돌려준다.
 * 원본 안의 문구는 분석할 데이터로만 취급한다. (지시문으로 해석하지 않음)
 */
export type TableRow = { rowNumber: number; location: string; data: Record<string, string> };
export type Table = { key: string; label: string; headers: string[]; rows: TableRow[] };
export type ReadResult =
  | { ok: true; reader: string; tables: Table[]; note: string; needsReview: boolean; text?: string }
  | { ok: false; reader: string; note: string };

const MAX_ROWS_PER_TABLE = 2000;

export async function readFile(name: string, bytes: Buffer): Promise<ReadResult | null> {
  const lower = name.toLowerCase();
  if (/\.(csv|tsv|txt)$/.test(lower)) return readDelimited(lower, bytes);
  if (lower.endsWith('.xlsx')) return readXlsx(bytes);
  if (lower.endsWith('.docx')) return readDocx(bytes);
  if (lower.endsWith('.pdf')) return readPdf(bytes);
  return null;
}

// ── CSV·TSV·TXT ──────────────────────────────────────────
function readDelimited(lower: string, bytes: Buffer): ReadResult {
  const text = bytes.toString('utf8');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = lower.endsWith('.csv') ? ',' : lower.endsWith('.tsv') ? '\t' : firstLine.includes('\t') ? '\t' : ',';
  const t = parseDelimited(text, delimiter);
  return {
    ok: true, reader: 'text@1', text, needsReview: false,
    note: `${t.rows.length}행을 읽었습니다.`,
    tables: [{ key: 'main', label: '', headers: t.headers, rows: t.rows.map((r) => ({ ...r, location: `${r.rowNumber}행` })) }],
  };
}

// 머리행: 비어 있지 않은 칸이 2개 이상인 첫 행
function toTable(key: string, label: string, grid: { rowNumber: number; cells: string[] }[], locate: (row: number) => string): Table | null {
  const headerIdx = grid.findIndex((r) => r.cells.filter((c) => c.trim()).length >= 2);
  if (headerIdx < 0) return null;
  const headers = grid[headerIdx].cells.map((h) => h.trim());
  const rows: TableRow[] = [];
  for (const r of grid.slice(headerIdx + 1)) {
    if (!r.cells.some((c) => c.trim())) continue;
    const data: Record<string, string> = {};
    headers.forEach((h, i) => { if (h) data[h] = (r.cells[i] ?? '').trim(); });
    rows.push({ rowNumber: r.rowNumber, location: locate(r.rowNumber), data });
    if (rows.length >= MAX_ROWS_PER_TABLE) break;
  }
  return { key, label, headers, rows };
}

// ── XLSX ─────────────────────────────────────────────────
async function readXlsx(bytes: Buffer): Promise<ReadResult> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    return { ok: false, reader: 'xlsx@1', note: '엑셀 파일을 열 수 없습니다. 암호가 걸려 있거나 손상된 파일일 수 있습니다.' };
  }
  let formulas = 0;
  const tables: Table[] = [];
  wb.eachSheet((ws) => {
    const grid: { rowNumber: number; cells: string[] }[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const v = cell.value as unknown;
        let s = '';
        if (v == null) s = '';
        else if (v instanceof Date) s = v.toISOString().slice(0, 10);
        else if (typeof v === 'object') {
          const o = v as { result?: unknown; formula?: string; sharedFormula?: string; richText?: { text: string }[]; text?: string };
          if ('formula' in o || 'sharedFormula' in o) {
            formulas++;
            const r = o.result;
            s = r instanceof Date ? r.toISOString().slice(0, 10) : r == null ? '' : String(r);
          } else if (o.richText) s = o.richText.map((t) => t.text).join('');
          else if (o.text != null) s = String(o.text);
          else s = String(cell.text ?? '');
        } else s = String(v);
        cells[col - 1] = s;
      });
      grid.push({ rowNumber, cells: Array.from(cells, (c) => c ?? '') });
    });
    const t = toTable(`sheet:${ws.name}`, `시트 ‘${ws.name}’`, grid, (r) => `시트 ‘${ws.name}’ ${r}행`);
    if (t && t.rows.length) tables.push(t);
  });
  const rowCount = tables.reduce((n, t) => n + t.rows.length, 0);
  return {
    ok: true, reader: 'xlsx@1', tables, needsReview: false,
    note: `시트 ${tables.length}개에서 ${rowCount}행을 읽었습니다.` + (formulas ? ` 수식 ${formulas}칸은 저장된 계산 결과값을 읽었습니다.` : ''),
  };
}

// ── DOCX ─────────────────────────────────────────────────
async function readDocx(bytes: Buffer): Promise<ReadResult> {
  const mammoth = (await import('mammoth')).default;
  const { parse } = await import('node-html-parser');
  let html: string;
  try {
    html = (await mammoth.convertToHtml({ buffer: bytes })).value;
  } catch {
    return { ok: false, reader: 'docx@1', note: '워드 파일을 열 수 없습니다. 손상됐거나 DOCX 형식이 아닐 수 있습니다.' };
  }
  const root = parse(html);
  const tables: Table[] = [];
  root.querySelectorAll('table').forEach((tbl, i) => {
    const grid = tbl.querySelectorAll('tr').map((tr, r) => ({
      rowNumber: r + 1,
      cells: tr.querySelectorAll('td,th').map((c) => c.text.replace(/\s+/g, ' ').trim()),
    }));
    const t = toTable(`table:${i + 1}`, `표 ${i + 1}`, grid, (r) => `표 ${i + 1} · ${r}행`);
    if (t && t.rows.length) tables.push(t);
  });
  const rowCount = tables.reduce((n, t) => n + t.rows.length, 0);
  return {
    ok: true, reader: 'docx@1', tables, needsReview: false,
    note: tables.length ? `문서의 표 ${tables.length}개에서 ${rowCount}행을 읽었습니다. 표 밖의 문단은 분석에 쓰지 않았습니다.` : '문서에서 표를 찾지 못했습니다. 문단은 아직 분석하지 않습니다.',
  };
}

// ── PDF ──────────────────────────────────────────────────
type PdfItem = { str: string; x: number; y: number; w: number; h: number };

async function readPdf(bytes: Buffer): Promise<ReadResult> {
  const { getDocumentProxy } = await import('unpdf');
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch {
    return { ok: false, reader: 'pdf@1', note: 'PDF를 열 수 없습니다. 암호가 걸려 있거나 손상된 파일일 수 있습니다.' };
  }
  const lines: { page: number; line: number; cells: string[] }[] = [];
  let textItems = 0;
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items: PdfItem[] = [];
    for (const it of content.items as { str?: string; transform?: number[]; width?: number; height?: number }[]) {
      if (!it.str || !it.str.trim() || !it.transform) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0, h: it.height || Math.abs(it.transform[3]) || 10 });
    }
    textItems += items.length;
    // 같은 높이(y)의 글자를 한 줄로 묶고, 글자 사이 간격이 크면 칸을 나눈다.
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: PdfItem[][] = [];
    for (const it of items) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last[0].y - it.y) <= Math.max(2, it.h * 0.4)) last.push(it);
      else rows.push([it]);
    }
    rows.forEach((row, idx) => {
      row.sort((a, b) => a.x - b.x);
      const cells: string[] = [];
      let prev: PdfItem | null = null;
      for (const it of row) {
        const gap = prev ? it.x - (prev.x + prev.w) : 0;
        if (!prev || gap > Math.max(8, it.h * 0.9)) cells.push(it.str.trim());
        else cells[cells.length - 1] = (cells[cells.length - 1] + (gap > 1 ? ' ' : '') + it.str).trim();
        prev = it;
      }
      lines.push({ page: p, line: idx + 1, cells });
    });
  }
  if (!textItems) {
    return { ok: false, reader: 'pdf@1', note: '글자 정보가 없는 PDF(스캔 이미지)입니다. 글자 인식(OCR)이 연결되지 않아 읽지 못했습니다.' };
  }
  // 칸 수가 같은 연속된 줄(2칸 이상)을 하나의 표로 본다.
  const tables: Table[] = [];
  let i = 0;
  while (i < lines.length) {
    const n = lines[i].cells.length;
    if (n < 2) { i++; continue; }
    let j = i;
    while (j + 1 < lines.length && lines[j + 1].cells.length === n) j++;
    if (j > i) {
      const block = lines.slice(i, j + 1);
      const k = tables.length + 1;
      const t = toTable(`table:${k}`, `PDF 표 ${k}`, block.map((l, idx) => ({ rowNumber: idx + 1, cells: l.cells })),
        (r) => `${block[r - 1].page}쪽 · ${block[r - 1].line}줄`);
      if (t && t.rows.length) tables.push(t);
    }
    i = j + 1;
  }
  const rowCount = tables.reduce((n, t) => n + t.rows.length, 0);
  return {
    ok: true, reader: 'pdf@1', tables, needsReview: true,
    note: tables.length
      ? `PDF ${pdf.numPages}쪽에서 표 ${tables.length}개, ${rowCount}행을 글자 위치로 추정했습니다. 근거 행을 원본과 대조해 주세요.`
      : `PDF ${pdf.numPages}쪽에서 표 모양의 줄을 찾지 못했습니다.`,
  };
}
