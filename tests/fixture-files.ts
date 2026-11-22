// 테스트용 XLSX·DOCX·PDF를 코드로 만든다. (합성 자료, 저장소에 바이너리를 두지 않음)
import ExcelJS from 'exceljs';
import { Document, Packer, Paragraph, Table, TableCell, TableRow } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';

/** A 학교 평가 자료: 1행 제목, 3행 머리행, 수식 칸, 빈 시트, 두 번째 시트 포함 */
export async function schoolAAssessmentsXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('평가일정');
  ws.getCell('A1').value = '2026학년도 평가 일정 (합성 예시)';
  ws.addRow([]);
  ws.addRow(['assessment_label', 'parent_period', 'weeks']);
  ws.addRow(['봄 평가', 'S1', 2]);
  ws.addRow(['여름 평가', 'S1', { formula: 'C4+1', result: 3 }]);
  ws.addRow(['가을 평가', 'S2', 2]);
  ws.addRow(['겨울 평가', { formula: 'B6', result: 'S2' }, 2]);
  wb.addWorksheet('비어 있음');
  const memo = wb.addWorksheet('메모');
  memo.addRow(['항목', '내용']);
  memo.addRow(['작성', '교무부']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A 학교 학사력: 문단 + 표 */
export async function schoolACalendarDocx(): Promise<Buffer> {
  const cell = (t: string) => new TableCell({ children: [new Paragraph(t)] });
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph('2026학년도 학사 운영 계획 (합성 예시)'),
        new Paragraph('아래 표는 정규 학기 구분입니다.'),
        new Table({
          rows: [
            new TableRow({ children: [cell('period_id'), cell('period_label')] }),
            new TableRow({ children: [cell('S1'), cell('1학기')] }),
            new TableRow({ children: [cell('S2'), cell('2학기')] }),
          ],
        }),
      ],
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

/** B 학교 학사력 PDF: 제목 줄 + 3칸 띄운 표 */
export async function schoolBCalendarPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  page.drawText('Academic Calendar 2026 (synthetic example)', { x: 50, y: 790, size: 14, font });
  const rows = [['period_id', 'period_label'], ['T1', 'Term One'], ['T2', 'Term Two'], ['T3', 'Term Three']];
  rows.forEach((r, i) => {
    page.drawText(r[0], { x: 50, y: 740 - i * 22, size: 11, font });
    page.drawText(r[1], { x: 220, y: 740 - i * 22, size: 11, font });
  });
  page.drawText('Prepared by the registrar.', { x: 50, y: 600, size: 10, font });
  return Buffer.from(await pdf.save());
}

/** 글자 정보가 없는 PDF (스캔 이미지와 같은 경우) */
export async function scannedPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  page.drawRectangle({ x: 50, y: 600, width: 300, height: 150 });
  return Buffer.from(await pdf.save());
}
