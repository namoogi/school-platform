// 14차 전체 흐름 E2E: 실제 Next 서버 + 로컬 Postgres + Chromium.
// 학교별 로그인 → 자료 누적 등록(파일 선택·끌어 놓기·시트 주소) → 근거 질문과 수정 → 발행 → 재로그인 후 복원
// → 규칙 수정 후 수정본 발행과 첫 발행본 보존 → 두 학교 간 HTTP 접근 거부(양방향).
// 실행: npm run build && npm run test:e2e   (SCREENSHOT_DIR 지정 시 화면 저장)
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const FIX = path.join(ROOT, 'school-platform-handoff', 'fixtures');
const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54322/postgres';
const DB = 'school_platform_e2e';
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`);
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SCREENSHOT_DIR;

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(['통과', name]);
    console.log('✓', name);
  } catch (e) {
    results.push(['실패', name]);
    console.error('✗', name, '\n ', e.message);
    throw e;
  }
}

// ── DB 준비 ──
const admin = new pg.Client({ connectionString: ADMIN_URL });
await admin.connect();
if (!(await admin.query('select 1 from pg_database where datname = $1', [DB])).rowCount) await admin.query(`create database ${DB}`);
await admin.end();
// SESSION_SECRET 없이 실행해 DB가 만든 서명 키 경로를 검증한다.
const env = { ...process.env, DATABASE_URL: DB_URL, NEXT_TELEMETRY_DISABLED: '1' };
delete env.SESSION_SECRET;
execFileSync('node', ['scripts/migrate.mjs', '--reset'], { cwd: ROOT, env, stdio: 'pipe' });
execFileSync('node', ['scripts/seed.mjs'], { cwd: ROOT, env, stdio: 'pipe' });

// ── 서버 시작 ── (이전 실행의 서버가 남아 있으면 옛 빌드를 검사하게 되므로 중단)
try {
  await fetch(`${BASE}/login`);
  console.error(`포트 ${PORT}을 이미 다른 프로세스가 쓰고 있습니다. 종료한 뒤 다시 실행하세요.`);
  process.exit(1);
} catch {}
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${BASE}/login`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch();
let exitCode = 0;
try {
  const ctxA = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), fullPage: true }); } };

  async function login(page, email, password) {
    await page.goto(`${BASE}/login`);
    await page.fill('input[name=email]', email);
    await page.fill('input[name=password]', password);
    await page.click('button[type=submit]');
    await page.waitForURL(/\/intake$/);
  }
  async function dropFile(page, name, text) {
    await page.evaluate(([n, t]) => {
      const dt = new DataTransfer();
      dt.items.add(new File([t], n, { type: 'text/csv' }));
      const zone = document.querySelector('[data-testid=dropzone]');
      zone.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, [name, text]);
  }
  const sourceItems = (page) => page.locator('[data-testid=source-list] li');

  await step('로그인 전에는 화면과 API가 막힌다', async () => {
    const r = await fetch(`${BASE}/api/sources`);
    assert.equal(r.status, 401);
    await a.goto(`${BASE}/intake`);
    assert.match(a.url(), /\/login$/);
    await a.fill('input[name=email]', 'admin-a@school-a.test');
    await a.fill('input[name=password]', 'wrong');
    await a.click('button[type=submit]');
    await a.waitForURL(/error=1/);
  });

  await step('예시 A 로그인 후 일정 CSV(파일 선택) → 평가 CSV(끌어 놓기) 누적 등록', async () => {
    await login(a, 'admin-a@school-a.test', 'demo-pass-a');
    assert.equal(await a.textContent('[data-testid=school-name]'), '드리미 예시학교');
    await a.setInputFiles('[data-testid=file-input]', path.join(FIX, 'school-a-calendar.csv'));
    await a.waitForFunction(() => document.querySelectorAll('[data-testid=source-list] li').length === 1);
    await dropFile(a, 'school-a-assessments.csv', fs.readFileSync(path.join(FIX, 'school-a-assessments.csv'), 'utf8'));
    await a.waitForFunction(() => document.querySelectorAll('[data-testid=source-list] li').length === 2);
    const text = await a.textContent('[data-testid=source-list]');
    assert.match(text, /school-a-calendar\.csv.*내용을 읽음.*2행/s);
    assert.match(text, /school-a-assessments\.csv.*내용을 읽음.*4행/s);
  });

  await step('시트 주소 여러 개는 ‘주소만 등록’ 상태로 따로 표시', async () => {
    await a.fill('input[type=url] >> nth=0', 'https://docs.google.com/spreadsheets/d/SYNTH-A-1/edit');
    await a.click('text=+ 주소 추가');
    await a.fill('input[type=url] >> nth=1', 'https://docs.google.com/spreadsheets/d/SYNTH-A-2/edit');
    await a.click('text=시트 주소 등록');
    await a.waitForFunction(() => document.querySelectorAll('[data-testid=source-list] li').length === 4);
    assert.equal(await a.locator('text=주소만 등록 · 내용 미열람').count(), 2);
    await shot(a, '01-a-intake.png');
  });

  await step('근거(파일·행)와 함께 두 학기·네 평가 기간을 묻고, 확인하면 1판 규칙 저장', async () => {
    await a.click('text=근거와 질문 보기');
    await a.waitForURL(/\/review$/);
    const prompt = await a.textContent('[data-testid=prompt]');
    assert.match(prompt, /기간 2개\(1학기, 2학기\)와 평가 기간 4개/);
    const ev = await a.textContent('[data-testid=evidence]');
    assert.match(ev, /추정 근거 · 6행/);
    assert.match(ev, /school-a-calendar\.csv\s*2행/);
    assert.match(ev, /school-a-assessments\.csv\s*5행\s*‘겨울 평가’ → S2/);
    await shot(a, '02-a-review.png');
    await a.click('text=이 기준 확정');
    await a.waitForSelector('[data-testid=rule-v1]');
  });

  let aDoc1;
  await step('A: 확정 규칙으로 문서 한 장 발행', async () => {
    await a.click('text=이 규칙으로 문서 발행');
    await a.waitForURL(/\/documents$/);
    await a.click('text=예시 문서 발행');
    await a.waitForURL(/\/documents\/[0-9a-f-]{36}$/);
    aDoc1 = a.url().split('/').pop();
    const paper = await a.textContent('[data-testid=paper]');
    assert.match(paper, /학기 학습 보고서/);
    assert.match(paper, /1학기.*봄 평가.*여름 평가.*2학기.*가을 평가.*겨울 평가/s);
    assert.match(await a.textContent('[data-testid=doc-facts]'), /발행 당시 값과 일치/);
    await shot(a, '03-a-document-v1.png');
  });

  let bDoc, bSource;
  await step('예시 B: 세 텀 자료를 한 번에 등록하고 발행하면 Term 표기', async () => {
    await login(b, 'admin-b@school-b.test', 'demo-pass-b');
    await b.setInputFiles('[data-testid=file-input]', [path.join(FIX, 'school-b-calendar.csv'), path.join(FIX, 'school-b-assessments.csv')]);
    await b.waitForFunction(() => document.querySelectorAll('[data-testid=source-list] li').length === 2);
    await b.goto(`${BASE}/review`);
    assert.match(await b.textContent('[data-testid=prompt]'), /Term One, Term Two, Term Three/);
    await b.click('text=이 기준 확정');
    await b.waitForSelector('[data-testid=rule-v1]');
    await b.goto(`${BASE}/documents`);
    await b.click('text=예시 문서 발행');
    await b.waitForURL(/\/documents\/[0-9a-f-]{36}$/);
    bDoc = b.url().split('/').pop();
    const paper = await b.textContent('[data-testid=paper]');
    assert.match(paper, /Term Learning Report/);
    assert.match(paper, /Term One.*Portfolio A.*Term Two.*Portfolio B.*Term Three.*Portfolio C/s);
    assert.doesNotMatch(paper, /학기/);
    const sources = await b.evaluate(() => fetch('/api/sources').then((r) => r.json()));
    bSource = sources[0].id;
    await shot(b, '04-b-document.png');
  });

  await step('A ↔ B: 상대 학교 문서·첨부를 열거나 바꾸려 하면 거부 (양방향)', async () => {
    const call = (page, url, method = 'GET', body) => page.evaluate(async ([u, m, bd]) => {
      const r = await fetch(u, { method: m, headers: bd ? { 'content-type': 'application/json' } : {}, body: bd ? JSON.stringify(bd) : undefined });
      return r.status;
    }, [url, method, body]);
    // A → B
    assert.equal(await call(a, `/api/documents/${bDoc}`), 404);
    assert.equal(await call(a, `/api/sources/${bSource}`), 404);
    assert.equal(await call(a, `/api/sources/${bSource}/archive`, 'POST'), 404);
    assert.equal(await call(a, '/api/documents', 'POST', { revisionOf: bDoc }), 404);
    const aPage = await a.goto(`${BASE}/documents/${bDoc}`);
    assert.equal(aPage.status(), 404);
    // B → A
    const aSources = await a.evaluate(() => fetch('/api/sources').then((r) => r.json()));
    const aSource = aSources.find((s) => s.status === 'parsed').id;
    assert.equal(await call(b, `/api/documents/${aDoc1}`), 404);
    assert.equal(await call(b, `/api/sources/${aSource}`), 404);
    assert.equal(await call(b, `/api/sources/${aSource}/archive`, 'POST'), 404);
    assert.equal(await call(b, '/api/documents', 'POST', { revisionOf: aDoc1 }), 404);
    assert.equal((await b.goto(`${BASE}/documents/${aDoc1}`)).status(), 404);
    // 각자 자기 기록은 정상
    assert.equal(await call(a, `/api/documents/${aDoc1}`), 200);
    assert.equal(await call(a, `/api/sources/${aSource}`), 200);
    assert.equal(await call(b, `/api/documents/${bDoc}`), 200);
    assert.equal(await call(b, `/api/sources/${bSource}`), 200);
    // 목록에도 상대 학교 기록이 섞이지 않는다
    const aList = await a.evaluate(() => fetch('/api/documents').then((r) => r.json()));
    assert.deepEqual(aList.map((d) => d.id), [aDoc1]);
    // 상대 학교의 기록은 그대로 남아 있다
    const bStill = await b.evaluate((id) => fetch(`/api/sources/${id}`).then((r) => r.json()), bSource);
    assert.equal(bStill.archived_at, null);
  });

  await step('다른 출처에서 보낸 쓰기 요청은 거부', async () => {
    const cookies = await ctxA.cookies();
    const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const r = await fetch(`${BASE}/api/documents`, { method: 'POST', headers: { cookie, origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 403);
  });

  let aDoc2;
  await step('A 재로그인 후 자료·규칙·발행본 복원, 규칙 수정(2판) 후 수정본 발행', async () => {
    await a.goto(`${BASE}/intake`);
    await a.click('text=로그아웃');
    await a.waitForURL(/\/login$/);
    await login(a, 'admin-a@school-a.test', 'demo-pass-a');
    assert.equal(await sourceItems(a).count(), 4);
    await a.goto(`${BASE}/documents`);
    assert.match(await a.textContent('[data-testid=doc-list]'), /학기 학습 보고서.*첫 발행.*규칙 1판 · 양식 1판/s);

    // 새 자료: 같은 기간의 다른 이름 → 확정값은 그대로, 다시 질문
    await a.goto(`${BASE}/intake`);
    await dropFile(a, 'a-2026-rename.csv', 'period_id,period_label\nS1,봄학기\nS2,가을학기\n');
    await a.waitForFunction(() => document.querySelectorAll('[data-testid=source-list] li').length === 5);
    await a.goto(`${BASE}/review`);
    assert.match(await a.textContent('[data-testid=question]'), /확정한 1판과 다르거나 충돌/);
    assert.match(await a.textContent('[data-testid=issues]'), /S1의 이름이 자료마다 다릅니다: ‘1학기’ \/ ‘봄학기’/);
    assert.match(await a.textContent('[data-testid=rule-v1]'), /1학기/);
    await a.click('text=고쳐서 확정합니다');
    await a.fill('[data-testid=editor] label:has-text("S1") input', '봄학기');
    await a.fill('[data-testid=editor] label:has-text("S2") input', '가을학기');
    await a.click('text=2판으로 확정');
    await a.waitForSelector('[role=alert]:has-text("근거")');
    await a.fill('textarea', '2026 학칙 개정 표기(합성 예시)');
    await shot(a, '05-a-review-edit.png');
    await a.click('text=2판으로 확정');
    await a.waitForSelector('[data-testid=rule-v2]');

    await a.goto(`${BASE}/documents/${aDoc1}`);
    await a.click('text=수정본 발행');
    await a.waitForURL((u) => /\/documents\/[0-9a-f-]{36}$/.test(u.toString()) && !u.toString().endsWith(aDoc1));
    aDoc2 = a.url().split('/').pop();
    const paper = await a.textContent('[data-testid=paper]');
    assert.match(paper, /봄학기.*봄 평가.*가을학기.*겨울 평가/s);
    assert.doesNotMatch(await a.textContent('[data-testid=paper] table'), /1학기|2학기/);
    assert.match(await a.textContent('[data-testid=doc-facts]'), /2판 \(관리자 수정\).*2026 학칙 개정 표기/s);
    assert.match(await a.textContent('[data-testid=doc-facts]'), /a-2026-rename\.csv/);
    await shot(a, '06-a-document-revision.png');
  });

  await step('첫 발행본은 당시 규칙·양식·표기 그대로 열리고 수정본과 연결', async () => {
    await a.click('[data-testid=prev-link]');
    await a.waitForURL(new RegExp(aDoc1 + '$'));
    const paper = await a.textContent('[data-testid=paper]');
    assert.match(paper, /1학기.*봄 평가.*2학기.*겨울 평가/s);
    assert.doesNotMatch(await a.textContent('[data-testid=paper] table'), /봄학기|가을학기/);
    const facts = await a.textContent('[data-testid=doc-facts]');
    assert.match(facts, /1판 \(분석 결과 확인\)/);
    assert.match(facts, /발행 당시 값과 일치/);
    await a.click('[data-testid=next-link]');
    await a.waitForURL(new RegExp(aDoc2 + '$'));
  });

  await step('15차: B가 PDF 학사력을 올리면 쪽·줄 위치와 정확도 확인 표시', async () => {
    const { schoolBCalendarPdf } = await import('../fixture-files.ts');
    const tmp = path.join(ROOT, 'test-results');
    fs.mkdirSync(tmp, { recursive: true });
    const file = path.join(tmp, 'b-calendar-2027.pdf');
    fs.writeFileSync(file, await schoolBCalendarPdf());
    await b.goto(`${BASE}/intake`);
    const before = await sourceItems(b).count();
    await b.setInputFiles('[data-testid=file-input]', file);
    await b.waitForFunction((n) => document.querySelectorAll('[data-testid=source-list] li').length === n + 1, before);
    const text = await b.textContent('[data-testid=source-list]');
    assert.match(text, /b-calendar-2027\.pdf.*내용을 읽음.*정확도 확인 필요.*표 1개, 3행/s);
    await shot(b, '07-b-intake-pdf.png');
  });

  await step('16차: 학교 관리자 설정 — 좌석·기능·예상 금액, 초대, 좌석 초과 안내', async () => {
    await a.goto(`${BASE}/settings`);
    assert.match(await a.textContent('[data-testid=seat-usage]'), /좌석 1 \/ 5/);
    await a.fill('[data-testid=license] input[type=number]', '2');
    await a.click('text=라이선스 저장');
    await a.waitForSelector('[data-testid=license] .tag:has-text("2판")');
    await a.fill('input[aria-label="초대할 이메일"]', 'teacher1@school-a.test');
    await a.click('[data-testid=members] button:text-is("초대")');
    await a.waitForSelector('text=초대 대기');
    assert.match(await a.textContent('[data-testid=seat-usage]'), /좌석 2 \/ 2/);
    await a.fill('input[aria-label="초대할 이메일"]', 'teacher2@school-a.test');
    await a.click('[data-testid=members] button:text-is("초대")');
    await a.waitForSelector('[role=status]:has-text("좌석이 모두 찼습니다")');
    await shot(a, '08-a-settings.png');
  });

  await step('16차: 전체 관리자 — 학교 현황, 학교 입장 기록, 학교 관리자에게 보임', async () => {
    const ctxP = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    const p = await ctxP.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill('input[name=email]', 'platform@example.test');
    await p.fill('input[name=password]', 'demo-pass-p');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/admin$/);
    const table = await p.textContent('[data-testid=school-table]');
    assert.match(table, /드리미 예시학교.*2 \/ 2.*Rungarun Example School/s);
    await shot(p, '09-platform-admin.png');
    await p.locator('[data-testid=school-table] tr', { hasText: '드리미 예시학교' }).locator('text=이 학교로 들어가기').click();
    await p.waitForURL(/\/intake$/);
    assert.match(await p.textContent('header.top'), /전체 관리자로 보는 중/);
    assert.equal(await p.textContent('[data-testid=school-name]'), '드리미 예시학교');
    await a.goto(`${BASE}/settings`);
    assert.match(await a.textContent('[data-testid=access-log]'), /예시 전체 관리자 \(전체 관리자\) · 전체 관리자 입장/);
    // 학교 관리자는 전체 관리 화면을 열 수 없다
    assert.equal((await a.goto(`${BASE}/admin`)).status(), 404);
    await ctxP.close();
  });
} catch (e) {
  exitCode = 1;
  console.error('\n서버 로그(마지막 2000자):\n' + serverLog.slice(-2000));
} finally {
  await browser.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
}
console.log(`\n${results.filter((r) => r[0] === '통과').length}/${results.length} 단계 통과`);
process.exit(exitCode);
