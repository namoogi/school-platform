/** 34차: PDF 검사 (DB 없이) — 머리·끝·크기, 실행 기능 거부(이름 #xx 표기·압축 객체 묶음 포함), 그림 스트림 오탐 없음 */
import { describe, expect, it } from 'vitest';
import { checkPdf, fileHeaders, PDF_MAX_BYTES, sniffMime } from '@/lib/pdf-check';
import { makePdf, PNG } from './fixture-pdf';

describe('PDF 검사', () => {
  it('그림·글만 있는 PDF는 통과하고, 그림 스트림 안의 우연한 글자는 보지 않는다', () => {
    expect(() => checkPdf(makePdf())).not.toThrow();
    expect(() => checkPdf(makePdf({ pad: 4096 }))).not.toThrow();
    expect(() => checkPdf(makePdf({ objStm: '5 0 << /Type /Annot /Subtype /Link /A << /S /URI /URI (https://example.org) >> >>' }))).not.toThrow();
  });
  it('머리·끝·크기를 확인한다', () => {
    expect(() => checkPdf(Buffer.from('hello'))).toThrow('PDF 파일이 아닙니다');
    expect(() => checkPdf(makePdf().subarray(0, 60))).toThrow('잘렸습니다');
    expect(() => checkPdf(Buffer.concat([makePdf(), Buffer.alloc(PDF_MAX_BYTES)]))).toThrow('4MB');
  });
  it('자바스크립트·실행·첨부·암호화 PDF는 거부한다', () => {
    expect(() => checkPdf(makePdf({ extra: '/OpenAction << /S /JavaScript /JS (app.alert(1)) >> ' }))).toThrow('JavaScript');
    expect(() => checkPdf(makePdf({ extra: '/OpenAction << /S /J#61vaScript /JS (x) >> ' }))).toThrow('실행 기능');
    expect(() => checkPdf(makePdf({ extra: '/OpenAction << /S /Launch /F (calc.exe) >> ' }))).toThrow('Launch');
    expect(() => checkPdf(makePdf({ extra: '/Names << /EmbeddedFiles 9 0 R >> ' }))).toThrow('EmbeddedFiles');
    expect(() => checkPdf(makePdf({ extra: '/AcroForm << /XFA 9 0 R >> ' }))).toThrow('XFA');
    expect(() => checkPdf(makePdf({ extra: '/Encrypt 9 0 R ' }))).toThrow('Encrypt');
  });
  it('압축된 객체 묶음(/ObjStm) 안에 숨긴 자바스크립트도 찾는다', () => {
    expect(() => checkPdf(makePdf({ objStm: '6 0 << /S /JavaScript /JS (app.alert(1)) >>' }))).toThrow('JavaScript');
  });
  it('파일 앞부분으로 형식을 정하고, PDF는 내려받기로만 준다', () => {
    expect(sniffMime(makePdf())).toBe('application/pdf');
    expect(sniffMime(PNG)).toBe('image/png');
    expect(sniffMime(Buffer.from('<svg/>'))).toBeNull();
    expect(fileHeaders('application/pdf')['content-disposition']).toBe('attachment');
    expect(fileHeaders('image/png')).toEqual({});
  });
});
