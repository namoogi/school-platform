import { inflateSync } from 'node:zlib';
import { ValidationError } from './services';

/**
 * 34차: 올리는 PDF 검사 (ADR 0012). 동화 PDF는 그림과 글만 담는다.
 * - 머리 `%PDF-`, 끝 `%%EOF`, 크기 4MB 이하 (Vercel 요청 한도 약 4.5MB)
 * - 실행·외부 동작 기능을 쓰는 PDF는 받지 않는다: 자바스크립트(/JavaScript, /JS), 프로그램 실행(/Launch),
 *   첨부 파일(/EmbeddedFile), 양식 전송·가져오기(/SubmitForm, /ImportData), XFA 양식, 리치 미디어, 암호화(검사 불가).
 * - 이름의 #xx 표기(/J#61vaScript)를 풀고, 객체 묶음(/ObjStm)의 Flate 압축을 풀어 그 안도 본다.
 * - 그림 등 다른 스트림 내용은 보지 않는다(무작위 바이트가 /JS 처럼 보이는 오탐을 막기 위해).
 * 남는 위험(다른 압축 필터로 숨긴 객체 등)은 ADR 0012에 적었고, 공개 화면은 PDF를 내려받기(attachment)로만 준다.
 */
export const PDF_MAX_BYTES = 4 * 1024 * 1024;
const FORBIDDEN = ['JavaScript', 'JS', 'Launch', 'EmbeddedFile', 'EmbeddedFiles', 'SubmitForm', 'ImportData', 'XFA', 'RichMedia', 'GoToE', 'Encrypt'];
const FORBIDDEN_RE = new RegExp(`/(${FORBIDDEN.join('|')})(?![A-Za-z0-9])`);
const INFLATE_LIMIT = 32 * 1024 * 1024;

const decodeNames = (s: string) => s.replace(/#([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

function found(s: string): string | null {
  const m = decodeNames(s).match(FORBIDDEN_RE);
  return m ? m[1] : null;
}

export function checkPdf(bytes: Buffer): void {
  if (!bytes.length || bytes.length > PDF_MAX_BYTES) throw new ValidationError('PDF는 4MB 이하여야 합니다. 웹용(150dpi 정도)으로 줄여 주세요.');
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new ValidationError('PDF 파일이 아닙니다.');
  if (!bytes.subarray(Math.max(0, bytes.length - 2048)).toString('latin1').includes('%%EOF')) throw new ValidationError('PDF 파일 끝이 잘렸습니다. 다시 만들어 주세요.');

  const s = bytes.toString('latin1');
  const outside: string[] = [];
  let pos = 0;
  let inflated = 0;
  const streamRe = /stream\r?\n/g;
  for (let m = streamRe.exec(s); m; m = streamRe.exec(s)) {
    // 'endstream' 의 일부이거나 사전(>>) 뒤가 아니면 건너뛴다
    if (s.slice(Math.max(0, m.index - 3), m.index) === 'end') continue;
    const dictEnd = s.lastIndexOf('>>', m.index);
    if (dictEnd < 0 || s.slice(dictEnd + 2, m.index).trim() !== '') continue;
    const dictStart = s.lastIndexOf('obj', dictEnd);
    const dict = s.slice(dictStart < 0 ? pos : Math.max(pos, dictStart), dictEnd + 2);
    const bodyStart = m.index + m[0].length;
    const end = s.indexOf('endstream', bodyStart);
    if (end < 0) throw new ValidationError('PDF 구조를 읽을 수 없습니다.');
    outside.push(s.slice(pos, bodyStart));
    if (/\/Type\s*\/ObjStm/.test(decodeNames(dict))) {
      if (!/\/FlateDecode/.test(dict) && /\/Filter/.test(dict)) throw new ValidationError('검사할 수 없는 압축을 쓴 PDF입니다. 일반 설정으로 다시 저장해 주세요.');
      let body = bytes.subarray(bodyStart, end);
      if (/\/FlateDecode/.test(dict)) {
        try { body = inflateSync(body, { maxOutputLength: INFLATE_LIMIT - inflated }); } catch {
          throw new ValidationError('PDF 안의 압축을 풀 수 없습니다. 일반 설정으로 다시 저장해 주세요.');
        }
      }
      inflated += body.length;
      const bad = found(body.toString('latin1'));
      if (bad) throw new ValidationError(`실행 기능(${bad})이 든 PDF는 올릴 수 없습니다. 그림·글만 담아 다시 만들어 주세요.`);
    }
    pos = end;
    streamRe.lastIndex = end + 9;
  }
  outside.push(s.slice(pos));
  const bad = found(outside.join('\n'));
  if (bad) throw new ValidationError(`실행 기능(${bad})이 든 PDF는 올릴 수 없습니다. 그림·글만 담아 다시 만들어 주세요.`);
}

/** 올린 파일의 앞부분으로 형식 확인 (형식 머리 위조 방지) */
export function sniffMime(bytes: Buffer): string | null {
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'image/jpeg';
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (bytes.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  return null;
}

/** PDF는 이 사이트 안에서 열지 않고 내려받게 한다(같은 출처에서 PDF 내용이 실행될 여지를 없앰). 파일 이름은 링크의 download 속성이 정한다 */
export function fileHeaders(mime: string): Record<string, string> {
  return mime === 'application/pdf' ? { 'content-disposition': 'attachment', 'content-security-policy': "sandbox; default-src 'none'" } : {};
}
