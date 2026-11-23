/** 29차: 실제 학교 준비(운영 전용 provision) — 한 번만 만들고, 다시 돌려도 바꾸지 않는다 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import pg from 'pg';
import { resetTestDb, TEST_URL } from './helpers';
import { provision } from '../scripts/provision.mjs';

let c: pg.Client;
const { schools } = JSON.parse(fs.readFileSync('ops/schools.json', 'utf8'));

beforeAll(async () => { await resetTestDb(); c = new pg.Client({ connectionString: TEST_URL }); await c.connect(); });
afterAll(async () => { await c.end(); });

describe('실제 학교 준비', () => {
  it('목록에 있는 학교를 시범 상태로 만들고, 기능·사이트 설정을 넣는다(홈페이지는 닫힘)', async () => {
    const logs: string[] = [];
    await c.query('begin');
    const made = await provision(c, schools, 'platform@example.test', (m: string) => logs.push(m));
    await c.query('commit');
    expect(made).toHaveLength(1);
    const { rows: [s] } = await c.query(`select id, name, locale, status from public.schools where slug = 'rungarunsuksa'`);
    expect(s).toMatchObject({ name: 'Rung Arun Suksa', locale: 'th', status: 'trial' });
    const { rows: [l] } = await c.query('select modules, seats from public.school_licenses where school_id = $1 order by version desc limit 1', [s.id]);
    expect(l.modules).toEqual(expect.arrayContaining(['intake', 'homepage', 'stories']));
    const { rows: [site] } = await c.query('select public_slug, default_lang, langs, is_open from public.site_settings where school_id = $1', [s.id]);
    expect(site).toEqual({ public_slug: 'rungarunsuksa', default_lang: 'th', langs: ['th', 'en', 'ko'], is_open: false });
    const { rows: [m] } = await c.query(`select m.role from public.memberships m join private.app_users u on u.id = m.user_id where m.school_id = $1 and u.email = 'platform@example.test'`, [s.id]);
    expect(m.role).toBe('admin');
  });

  it('다시 돌려도 이미 있는 학교는 바꾸지 않는다', async () => {
    await c.query(`update public.schools set name = '이름 바꿈' where slug = 'rungarunsuksa'`);
    const logs: string[] = [];
    await c.query('begin');
    expect(await provision(c, schools, 'platform@example.test', (m: string) => logs.push(m))).toEqual([]);
    await c.query('commit');
    expect(logs.join()).toMatch(/이미 있음/);
    expect((await c.query(`select name from public.schools where slug = 'rungarunsuksa'`)).rows[0].name).toBe('이름 바꿈');
  });

  it('전체 관리자가 없으면 아무것도 만들지 않는다', async () => {
    await c.query('begin');
    expect(await provision(c, [{ ...schools[0], slug: 'other-school', site: { ...schools[0].site, public_slug: 'other-school' } }], 'nobody@example.test', () => {})).toEqual([]);
    await c.query('commit');
    expect((await c.query(`select 1 from public.schools where slug = 'other-school'`)).rowCount).toBe(0);
  });
});
