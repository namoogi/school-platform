import { deflateSync } from 'node:zlib';

/** 34차 시험용 합성 PDF (실제 동화 아님). extra 는 카탈로그 사전에 덧붙일 글, objStm 은 압축 객체 묶음에 넣을 글 */
export function makePdf({ extra = '', objStm, pad = 0 }: { extra?: string; objStm?: string; pad?: number } = {}): Buffer {
  const parts: Buffer[] = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  parts.push(Buffer.from(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R ${extra}>>\nendobj\n`, 'latin1'));
  parts.push(Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\n', 'latin1'));
  if (objStm !== undefined) {
    const z = deflateSync(Buffer.from(objStm, 'latin1'));
    parts.push(Buffer.from(`4 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ${z.length} >>\nstream\n`, 'latin1'), z, Buffer.from('\nendstream\nendobj\n', 'latin1'));
  }
  if (pad) {
    // 그림 스트림 흉내: 무작위처럼 보이는 바이트 안에 '/JS' 가 우연히 들어 있어도 검사가 오탐하지 않아야 한다
    const body = Buffer.alloc(pad, 0x41);
    body.write('/JS /JavaScript', 10, 'latin1');
    parts.push(Buffer.from(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /Filter /DCTDecode /Length ${pad} >>\nstream\n`, 'latin1'), body, Buffer.from('\nendstream\nendobj\n', 'latin1'));
  }
  parts.push(Buffer.from('trailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1'));
  return Buffer.concat(parts);
}

export const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
