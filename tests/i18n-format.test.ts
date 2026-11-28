import fs from 'node:fs';
import path from 'node:path';
/** ADR 0037: 화면 문구 채우기·대체 순서·브라우저 언어 고르기 (DB 없이) */
import { describe, expect, it } from 'vitest';
import { fallbackChain, formatMessage, pickFromAcceptLanguage, placeholders, safeLocale, sameShape } from '@/lib/i18n/format';
import { CATALOG } from '@/lib/i18n/catalog';
import en from '../i18n/en.json';

describe('formatMessage', () => {
  it('{name} 을 채우고, 없는 값은 그대로 둔다', () => {
    expect(formatMessage('화면 형식: {kind}', { kind: '분석' })).toBe('화면 형식: 분석');
    expect(formatMessage('{a} {b}', { a: 1 })).toBe('1 {b}');
  });
  it('복수형은 그 언어의 규칙(Intl.PluralRules)으로 고른다 — 코드에 언어별 분기가 없다', () => {
    const m = '{n, plural, =0 {none} one {# item} other {# items}}';
    expect(formatMessage(m, { n: 0 }, 'en')).toBe('none');
    expect(formatMessage(m, { n: 1 }, 'en')).toBe('1 item');
    expect(formatMessage(m, { n: 5 }, 'en')).toBe('5 items');
    // 아랍어는 two·few·many 가 따로 있다 — 목록에 없는 형태는 other 로
    expect(formatMessage('{n, plural, two {둘} other {#개}}', { n: 2 }, 'ar')).toBe('둘');
    expect(formatMessage('{n, plural, one {# 개} other {# 개}}', { n: 3 }, 'ko')).toBe('3 개');
  });
});

describe('대체 순서', () => {
  const langs = [{ code: 'ko', fallback: null }, { code: 'en', fallback: null }, { code: 'th', fallback: 'en' }, { code: 'lo', fallback: 'th' }];
  it('언어 → fallback 사슬 → 영어 → 한국어', () => {
    expect(fallbackChain('lo', langs)).toEqual(['lo', 'th', 'en', 'ko']);
    expect(fallbackChain('en', langs)).toEqual(['en', 'ko']);
    expect(fallbackChain('xx', langs)).toEqual(['xx', 'en', 'ko']);
  });
  it('fallback 고리가 돌아도 멈춘다', () => {
    expect(fallbackChain('a', [{ code: 'a', fallback: 'b' }, { code: 'b', fallback: 'a' }])).toEqual(['a', 'b', 'en', 'ko']);
  });
});

describe('브라우저 언어', () => {
  it('정확한 코드 → 앞부분 코드, 품질값 순', () => {
    expect(pickFromAcceptLanguage('th-TH,th;q=0.9,en;q=0.8', ['ko', 'en', 'th'])).toBe('th');
    expect(pickFromAcceptLanguage('fr-FR,en;q=0.5', ['ko', 'en'])).toBe('en');
    expect(pickFromAcceptLanguage('fr', ['ko', 'en'])).toBeNull();
  });
});

describe('기본 영어 묶음', () => {
  it('목록의 모든 이름표에 영어가 있고, 목록에 없는 이름표는 없다', () => {
    const keys = Object.keys(CATALOG);
    expect(keys.filter((k) => !(k in en))).toEqual([]);
    expect(Object.keys(en).filter((k) => !keys.includes(k))).toEqual([]);
  });
  it('채우기 자리({…})가 기준 문구와 같다', () => {
    const bad = Object.entries(CATALOG).filter(([k, v]) => !sameShape(v, (en as Record<string, string>)[k])).map(([k]) => k);
    expect(bad).toEqual([]);
  });
});

describe('다른 언어 묶음(i18n/*.json, 영어 말고)', () => {
  // 묶음이 있는 언어는 빠짐없이 채운다(사용자 결정 2026-11-28 "새 문구도 태국어 자동으로"). 새 이름표는 scripts/i18n-add.mjs 로 모든 묶음에 함께 넣는다.
  // 묶음 없이 관리 화면에서 더한 언어는 이 시험 대상이 아니다(빠진 문구는 대체 언어로 보임)
  const dir = path.resolve(__dirname, '..', 'i18n');
  const packs = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json');
  it.each(packs)('%s: 목록의 모든 이름표가 있고, 목록에 있는 이름표만, 채우기 자리는 기준 문구와 같다', (file) => {
    const pack = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Record<string, string>;
    expect(Object.keys(CATALOG).filter((k) => !(k in pack)), `${file}에 빠진 이름표 — node scripts/i18n-missing.mjs 로 목록을 받아 채운다`).toEqual([]);
    expect(Object.keys(pack).filter((k) => !(k in CATALOG))).toEqual([]);
    expect(Object.entries(pack).filter(([k, v]) => !sameShape(CATALOG[k as keyof typeof CATALOG], v)).map(([k]) => k)).toEqual([]);
  });
});

describe('번역 모양 검사', () => {
  it('채우기 자리 이름이 다르거나 중괄호 짝이 맞지 않으면 거부', () => {
    expect(placeholders('{n, plural, one {#} other {# {unit}}}')).toEqual(['n', 'unit']);
    expect(sameShape('화면 형식: {kind}', 'Layout: {kind}')).toBe(true);
    expect(sameShape('화면 형식: {kind}', 'Layout: {type}')).toBe(false);
    expect(sameShape('{n, plural, other {#개}}', '{n, plural, one {# item} other {# items}')).toBe(false);
  });
});

describe('형식용 언어(safeLocale)', () => {
  it('문법이 틀린 코드(en-12)는 대체 언어로 — 날짜 형식이 오류로 화면을 막지 않는다', () => {
    expect(safeLocale('en')).toBe('en');
    expect(safeLocale('zh-Hant')).toBe('zh-Hant');
    expect(safeLocale('en-12')).toBe('ko');
    expect(() => new Date(0).toLocaleString(safeLocale('en-12'))).not.toThrow();
  });
});
