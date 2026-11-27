import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { dbMessageKey, errorBody } from '@/lib/api';
import { CATALOG, type MsgKey } from '@/lib/i18n/catalog';
import en from '../i18n/en.json';

// ADR 0039: 서버 오류는 이름표(+값)로 던지고, 응답 때 사용자 언어로 바꾼다.
const enDict = en as Record<string, string>;

describe('서버 오류 이름표', () => {
  it('이름표로 던지면 message 는 기준 문구(한국어), key·vars 를 지닌다', () => {
    const e = new ValidationError('err.loginRequired');
    expect(e.message).toBe(CATALOG['err.loginRequired']);
    expect(e.key).toBe('err.loginRequired');
    expect(e).toBeInstanceOf(AppError);
  });

  it('이름표가 아닌 문장은 그대로 둔다(아직 옮기지 않은 곳)', () => {
    const e = new NotFoundError('없는 수업입니다.');
    expect(e.message).toBe('없는 수업입니다.');
    expect(e.key).toBeUndefined();
    expect(errorBody(e, 'en', enDict)).toEqual({ status: 404, body: { error: '없는 수업입니다.' } });
  });

  it('응답은 요청 언어로 바꾸고 code 에 이름표를 싣는다', () => {
    expect(errorBody(new ForbiddenError('err.schoolAdminOnly'), 'en', enDict))
      .toEqual({ status: 403, body: { error: enDict['err.schoolAdminOnly'], code: 'err.schoolAdminOnly' } });
    expect(errorBody(new ForbiddenError('err.schoolAdminOnly')))
      .toEqual({ status: 403, body: { error: CATALOG['err.schoolAdminOnly'], code: 'err.schoolAdminOnly' } });
  });

  it('DB 오류: 중복·권한·알 수 없는 오류는 공통 이름표', () => {
    expect(errorBody({ code: '23505', message: 'duplicate key' }, 'en', enDict).body.code).toBe('err.duplicate');
    expect(errorBody({ code: '42501', message: 'permission denied for table x' }, 'en', enDict).body)
      .toEqual({ error: enDict['err.noAccess'], code: 'err.noAccess' });
    const quiet = console.error; console.error = () => {};
    try { expect(errorBody(new Error('boom')).status).toBe(500); } finally { console.error = quiet; }
  });

  it('DB 함수의 한국어 안내: 이름표가 없으면 그대로', () => {
    expect(errorBody({ code: '22023', message: '이 문장은 이름표가 없습니다.' }, 'en', enDict).body)
      .toEqual({ error: '이 문장은 이름표가 없습니다.' });
  });

  it("'db.' 이름표의 기준 문구는 마이그레이션의 raise 문구와 글자까지 같다(어긋나면 번역이 조용히 멈춘다)", () => {
    const dir = path.resolve(__dirname, '..', 'supabase', 'migrations');
    const sql = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    const keys = (Object.keys(CATALOG) as MsgKey[]).filter((k) => k.startsWith('db.'));
    for (const k of keys) {
      const ko = CATALOG[k] as string;
      expect(sql.includes(`'${ko.replace(/'/g, "''")}'`), `${k}: ${ko}`).toBe(true);
      expect(dbMessageKey(ko)).toBe(k);
      expect(ko.includes('%'), `${k}: 값이 든 문구는 이름표로 바꾸지 않는다`).toBe(false);
    }
  });
});

describe('DB 안내 번역', () => {
  it('학교 관리자 전용 안내(DB)는 공통 이름표와 같은 문구라 함께 번역된다', () => {
    expect(errorBody({ code: '22023', message: '학교 관리자만 할 수 있습니다.' }, 'en', enDict).body)
      .toEqual({ error: enDict['err.schoolAdminOnly'], code: 'err.schoolAdminOnly' });
    expect(errorBody({ code: 'P0409', message: '그 사이 새 판이 생겼습니다.' }, 'en', enDict))
      .toEqual({ status: 409, body: { error: enDict['db.versionConflict'], code: 'db.versionConflict' } });
  });
});

describe('코드 속 오류 이름표', () => {
  it('던지는 이름표는 모두 사전에 있다(오타면 한국어 이름표 문자열이 그대로 나간다)', () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name)) files.push(p); } };
    walk(path.resolve(__dirname, '..', 'src'));
    const bad: string[] = [];
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8');
      for (const m of s.matchAll(/(?:Error\(|fail\(\d+, |error: )'((?:err|db)\.[A-Za-z0-9_.]+)'/g)) if (!(m[1] in CATALOG)) bad.push(`${path.basename(f)}: ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });

  it('값 속 명사·이름표도 그 언어로 바뀐다', () => {
    expect(new NotFoundError('err.whatNotFound', { what: '학생' }).message).toBe('학생을(를) 찾을 수 없습니다.');
    expect(errorBody(new NotFoundError('err.whatNotFound', { what: '학생' }), 'en', enDict).body.error).toBe('Student not found.');
    expect(errorBody(new ValidationError('err.devlink.urlForm', { kind: 'devlink.kind.github_repo', example: 'https://github.com/o/r' }), 'en', enDict).body.error)
      .toBe(`This isn't a valid ${enDict['devlink.kind.github_repo']} address. Example: https://github.com/o/r`);
  });
});
