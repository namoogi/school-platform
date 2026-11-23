import { describe, it, expect } from 'vitest';
import { checkFiles, describeAccept, formatSize, matchesAccept } from '../src/lib/file-check';

const f = (name: string, type = '', size = 100) => ({ name, type, size });
const MB = 1024 * 1024;

describe('37차 파일 첨부 검사 (FileDrop)', () => {
  it('형식: 확장자·형식·와일드카드, 대소문자 무시', () => {
    expect(matchesAccept(f('A.ZIP'), ['.zip'])).toBe(true);
    expect(matchesAccept(f('a.png', 'image/png'), ['image/*'])).toBe(true);
    expect(matchesAccept(f('a.pdf', 'application/pdf'), ['application/pdf'])).toBe(true);
    expect(matchesAccept(f('a.exe', 'application/octet-stream'), ['.csv', 'image/*'])).toBe(false);
    expect(matchesAccept(f('noext'), ['.csv'])).toBe(false);
    expect(matchesAccept(f('x.bin'), undefined)).toBe(true);
  });

  it('크기·빈 파일·형식 오류는 쉬운 문장으로, 맞는 파일만 받는다', () => {
    const r = checkFiles([f('ok.csv', 'text/csv'), f('big.csv', 'text/csv', 3 * MB), f('empty.csv', 'text/csv', 0), f('x.exe')],
      { accept: ['.csv'], maxSize: 2 * MB, multiple: true });
    expect(r.accepted.map((x) => x.name)).toEqual(['ok.csv']);
    expect(r.errors).toEqual([
      '‘big.csv’은(는) 3MB로, 최대 2MB보다 큽니다.',
      '‘empty.csv’은(는) 빈 파일입니다.',
      '‘x.exe’은(는) 올릴 수 없는 형식입니다. CSV 파일을 골라 주세요.',
    ]);
  });

  it('개수: 하나만 받는 칸은 첫 파일만, 여러 개는 maxFiles까지', () => {
    const one = checkFiles([f('a.zip'), f('b.zip')], { accept: ['.zip'] });
    expect(one.accepted.map((x) => x.name)).toEqual(['a.zip']);
    expect(one.errors[0]).toMatch(/하나만/);
    const many = checkFiles([f('a.csv'), f('b.csv'), f('c.csv')], { accept: ['.csv'], multiple: true, maxFiles: 2 });
    expect(many.accepted).toHaveLength(2);
    expect(many.errors[0]).toMatch(/2개까지/);
    expect(checkFiles([], {}).errors).toEqual([]);
  });

  it('형식 이름·크기 표기', () => {
    expect(describeAccept(['image/png', 'image/jpeg', 'application/pdf'])).toBe('PNG·JPEG·PDF');
    expect(describeAccept(['.zip', 'application/zip'])).toBe('ZIP');
    expect(describeAccept(['image/*'])).toBe('그림');
    expect(formatSize(500)).toBe('500바이트');
    expect(formatSize(12 * 1024)).toBe('12KB');
    expect(formatSize(4.5 * MB)).toBe('4.5MB');
    expect(formatSize(5 * MB)).toBe('5MB');
  });

  it('typeLabel이 있으면 오류 문구에 그 이름을 쓴다', () => {
    const r = checkFiles([f('a.txt', 'text/plain')], { accept: ['image/png'], typeLabel: 'PNG 그림' });
    expect(r.errors[0]).toContain('PNG 그림 파일을 골라 주세요');
  });
});
