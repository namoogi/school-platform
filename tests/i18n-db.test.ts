/** ADR 0037: 언어 목록·번역 사전 — 누구나 읽고, 전체 관리자만 명령 함수로 쓰며, 기본 묶음은 빈 칸만 채운다 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';
import { applyPacks } from '../scripts/i18n-packs.mjs';

process.env.DATABASE_URL = TEST_URL;
const { asUser, asPublic, getPool } = await import('@/lib/db');
const lg = await import('@/lib/languages');

let A: { schoolId: string; userId: string };
let platformId: string;
let su: pg.Client;
beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  platformId = (await su.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id;
}, 60_000);
afterAll(async () => { await su.end(); await getPool().end(); });

describe('언어 목록·번역 사전', () => {
  it('로그인 전(anon)에도 언어 목록과 번역을 읽는다', async () => {
    const r = await asPublic(async (db) => ({
      langs: (await db.query('select code from public.languages order by sort')).rows.map((x) => x.code),
      en: (await db.query(`select text from public.ui_messages where lang = 'en' and key = 'login.submit'`)).rows[0]?.text,
    }));
    expect(r.langs).toEqual(expect.arrayContaining(['ko', 'en', 'th']));
    expect(r.en).toBe('Sign in'); // 시드가 기본 영어 묶음을 넣었다
  });

  it('학교 관리자는 언어·번역을 바꿀 수 없다(명령 함수 거부, 표 직접 쓰기 거부)', async () => {
    await expect(asUser(A.userId, (db) => lg.saveLanguage(db, { code: 'vi', native_name: 'Tiếng Việt' }))).rejects.toThrow(/전체 관리자/);
    await expect(asUser(A.userId, (db) => db.query(`insert into public.ui_messages(lang, key, text) values ('en', 'login.submit', 'x')`))).rejects.toThrow();
    await expect(asUser(A.userId, (db) => db.query(`update public.ui_messages set text = 'x'`))).rejects.toThrow(/permission denied/);
  });

  it('전체 관리자가 언어를 더하면 코드 변경 없이 바로 쓸 수 있고, 목록 밖 이름표는 받지 않는다', async () => {
    await asUser(platformId, (db) => lg.saveLanguage(db, { code: 'vi', native_name: 'Tiếng Việt', fallback: 'en' }));
    const r = await asUser(platformId, (db) => lg.saveMessages(db, 'vi', { 'login.submit': 'Đăng nhập', 'no.such.key': 'x' }, false));
    expect(r).toEqual({ saved: 1, skippedUnknown: 1 });
    const list = await asUser(platformId, (db) => lg.listLanguages(db));
    expect(list.rows.find((l) => l.code === 'vi')).toMatchObject({ native_name: 'Tiếng Việt', translated: 1, active: true });
  });

  it('덮어쓰지 않기(overwrite=false)는 이미 있는 번역을 두고, 기본 묶음 다시 넣기도 고친 번역을 되돌리지 않는다', async () => {
    await asUser(platformId, (db) => lg.saveMessages(db, 'en', { 'login.submit': 'Log in' }, true));
    await asUser(platformId, (db) => lg.saveMessages(db, 'en', { 'login.submit': 'Sign in!!' }, false));
    expect((await su.query(`select text from public.ui_messages where lang = 'en' and key = 'login.submit'`)).rows[0].text).toBe('Log in');
    await applyPacks(su, undefined, () => {});
    expect((await su.query(`select text from public.ui_messages where lang = 'en' and key = 'login.submit'`)).rows[0].text).toBe('Log in');
  });

  it('언어 코드·이름 검사', async () => {
    await expect(asUser(platformId, (db) => lg.saveLanguage(db, { code: 'Vietnamese', native_name: 'x' }))).rejects.toThrow(/BCP 47/);
    await expect(asUser(platformId, (db) => lg.saveLanguage(db, { code: 'vi', native_name: '' }))).rejects.toThrow(/이름/);
  });
});
