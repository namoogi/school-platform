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
import { zipSync, strToU8 } from 'fflate';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const AXE_SOURCE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

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

// 화면 선택(UiControls)은 누르는 즉시 .app 속성을 바꾸고 저장 요청은 뒤따른다(낙관적 갱신).
// 속성만 보고 새로 고치면 느린 CI에서 저장 전에 새로 고쳐 옛 설정이 돌아온다. 저장 응답까지 기다린다.
async function clickUiAndSave(page, selector) {
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/preferences/ui') && r.request().method() === 'POST');
  await page.click(selector);
  const res = await saved;
  assert.ok(res.ok(), `화면 설정 저장 실패: ${res.status()}`);
}

// 키보드 단축키(Ctrl+K, J)는 화면이 수화(hydration)된 뒤 window keydown 처리기가 붙어야 먹는다.
// 페이지를 열자마자 누르면 느린 CI에서는 처리기가 붙기 전이라 키가 사라진다. 반응이 올 때까지 다시 누른다.
// (한 번 누를 때마다 3초 기다려, 늦게 처리된 누름을 두 번째 누름이 되돌리지 않게 한다)
async function pressUntil(page, key, check, arg) {
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press(key);
    try { await page.waitForFunction(check, arg, { timeout: 3000 }); return; } catch { /* 다시 누른다 */ }
  }
  throw new Error(`${key}: 화면이 키 입력에 반응하지 않습니다`);
}

// 31차: 합성 내보내기 묶음(rung-arun-export/1). 실제 학교 글이 아니다.
function makeExportZip() {
  const L = (en) => ({ th: `ไทย ${en}`, en, ko: `한국어 ${en}` });
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
  const ui = Object.fromEntries(['about', 'curriculum', 'life', 'gallery', 'news', 'admissions', 'contact', 'visit', 'contactSchool', 'viewGallery', 'stages',
    'activities', 'nameTitle', 'location', 'nextStep', 'documents', 'faq', 'office', 'hours', 'map', 'facebook', 'poster'].map((k) => [k, L(k[0].toUpperCase() + k.slice(1))]));
  Object.assign(ui, { classroom: L('Classroom'), art: L('Art'), grounds: L('Grounds') });
  const a = (src, category) => ({ src, category, alt: L(`Photo ${src.split('/').pop()}`) });
  const content = {
    format: 'rung-arun-export/1', exportedAt: '2026-11-23T00:00:00Z', languages: { school: ['th', 'en', 'ko'] },
    defaults: {
      name: L('Dawn Example School'), location: L('Example Town'), intro: L('A synthetic example school.'), hero: L('Hero line'), nameMeaning: L('The name means dawn.'),
      philosophyTitle: L('Learning'), philosophyIntro: L('Learning intro'), knownNote: L('Synthetic data for tests.'), curriculumNote: L('Curriculum note'),
      galleryIntro: L('Open a photo.'), dayTitle: L('Ask about the day'), dayNote: L('Day note'), admissionsIntro: L('Admissions intro'), admissionsArchive: L('Archive note'),
      contactIntro: L('Contact the office.'), contactNote: L('Contact note'), officeHours: L('08:30-16:30'), address: '1 Example Road', addressThai: 'ถนนตัวอย่าง 1',
      phone: ['000-0000000'], facebook: 'https://www.facebook.com/example', ui,
      values: [{ title: L('Making'), body: L('Making body') }],
      stages: [{ title: L('Early years'), subtitle: L('First steps'), body: L('Stage body'), photo: 'workshop', points: [L('Drawing')], note: L('Ask') }],
      activities: [{ title: L('Stories'), body: L('Stories body') }], dayQuestions: [L('Arrival time')],
      admissionSteps: [{ title: L('Ask'), body: L('Ask body') }], documents: [L('ID copy')], faq: [{ q: L('Fees?'), a: L('Ask the office') }],
      stories: [{ id: 'making', photo: 'together', title: L('Choosing colours'), teaser: L('Teaser'), body: [L('Paragraph one')] }],
      assets: { campus: a('/assets/campus.jpg', 'grounds'), workshop: a('/assets/workshop.jpg', 'classroom'), together: a('/assets/together.jpg', 'classroom'),
        artwork: a('/assets/artwork.jpg', 'art'), circle: a('/assets/circle.jpg', 'classroom'), classroom: a('/assets/classroom.jpg', 'classroom'),
        entrance: a('/assets/entrance.jpg', 'grounds'), logo: a('/assets/logo.jpg', 'brand') },
      copy: { homeTitle: L('Dawn Example.<br>A new day.'), homeIdentity: L('Rainbow and dawn'), homePortraitTitle: L('A picture'), homePortraitBody: L('Portrait body'), homeMomentsTitle: L('Together') },
    },
    tables: { news_posts: [], photos: [] },
  };
  const friends = { format: 'school-platform-pages/1', pages: [
    { key: 'friends', content: { title: { ko: '후원자 첫 쪽', en: 'Supporters' }, blocks: [{ type: 'section', template: 'cards', items: [{ title: { ko: '예시 편지' }, href: '/p/friends-letter-welcome' }] }] } },
    { key: 'friends-letter-welcome', content: { title: { ko: '예시 편지', en: 'Sample letter' }, blocks: [{ type: 'text', text: { ko: '합성 편지 글', en: 'Synthetic letter' } }] } },
  ] };
  const book = { slug: 'dawn-story', locale: 'th', title: 'นิทานตัวอย่าง', title_ko: '예시 동화', character: ['ช้าง(코끼리)'], virtue: null,
    pages: [{ no: 1, image: 'pages/01.jpg', text: 'หน้าหนึ่ง' }, { no: 2, image: 'pages/02.jpg', text: 'หน้าสอง' }] };
  const img = (n) => Uint8Array.from(Buffer.concat([PNG, Buffer.from([n])]));
  const files = { 'content.json': strToU8(JSON.stringify(content)), 'friends/pages.json': strToU8(JSON.stringify(friends)),
    'stories/dawn-story/book.json': strToU8(JSON.stringify(book)), 'stories/dawn-story/pages/01.jpg': img(1), 'stories/dawn-story/pages/02.jpg': img(2) };
  ['campus', 'workshop', 'together', 'artwork', 'circle', 'classroom', 'entrance', 'logo'].forEach((k, i) => { files[`assets/site/assets/${k}.jpg`] = img(10 + i); });
  files['manifest.json'] = strToU8(JSON.stringify({ format: 'rung-arun-export/1', files: Object.keys(files).map((path) => ({ path })) }));
  return Buffer.from(zipSync(files));
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
  // 접근성 자동 검사(axe-core): 화면을 찍는 지점마다 WCAG 2.1 A·AA 규칙으로 검사하고,
  // 심각도 serious 이상 위반을 모아 마지막 단계에서 0건인지 확인한다.
  const axeFindings = [];
  async function axeCheck(page, label) {
    // router.refresh() 직후에는 <head>의 <title>이 잠깐 빠졌다 다시 붙는다. 그 순간을 잡지 않도록
    // 화면이 안정되길 기다린다(최대 5초). 끝내 제목이 없으면 axe가 그대로 위반으로 잡는다.
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForFunction(() => document.title !== '', null, { timeout: 5000 }).catch(() => {});
    await page.addScriptTag({ content: AXE_SOURCE });
    const found = await page.evaluate(async () => {
      const r = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        resultTypes: ['violations'],
      });
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => ({
        id: v.id, impact: v.impact, help: v.help, count: v.nodes.length,
        targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      }));
    });
    for (const f of found) axeFindings.push({ page: label, path: new URL(page.url()).pathname, ...f });
  }
  const shot = async (page, name) => {
    await axeCheck(page, name.replace(/\.png$/, ''));
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), fullPage: true }); }
  };

  async function login(page, email, password) {
    await page.goto(`${BASE}/login`);
    await page.fill('input[name=email]', email);
    await page.fill('input[name=password]', password);
    await page.click('button[type=submit]');
    await page.waitForURL(/\/home$/);
    await page.goto(`${BASE}/intake`);
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
    await shot(a, '00-login-error.png');
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

  await step('37차: 파일 첨부(FileDrop) — 키보드로 고르기, 형식·크기 오류는 올리지 않고 글로 안내', async () => {
    const before = await sourceItems(a).count();
    // 키보드: Tab으로 단추에 가서 Enter → 파일 창
    await a.waitForSelector('[data-testid=dropzone][data-ready]');
    await a.focus('[data-testid=dropzone] button');
    const [chooser] = await Promise.all([a.waitForEvent('filechooser'), a.keyboard.press('Enter')]);
    assert.ok(chooser.isMultiple(), '여러 파일 고르기');
    await chooser.setFiles({ name: 'setup.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
    await a.waitForSelector('[data-testid=dropzone-errors]:has-text("올릴 수 없는 형식")');
    assert.match(await a.textContent('[role=status][aria-live=polite]:has-text("올리지 않았습니다")'), /setup\.exe/);
    // 끌어 놓기도 같은 검사: 2MB 넘는 CSV
    await a.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(2 * 1024 * 1024 + 10)], 'big.csv', { type: 'text/csv' }));
      const zone = document.querySelector('[data-testid=dropzone]');
      zone.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
      zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await a.waitForSelector('[data-testid=dropzone-errors]:has-text("최대 2MB보다 큽니다")');
    assert.equal(await sourceItems(a).count(), before, '오류 파일은 등록되지 않는다');
    await shot(a, '36-filedrop-error.png');
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

  await step('25차: 홈(학사 업무형)과 관리자 확인 3단 작업함', async () => {
    await a.goto(`${BASE}/`);
    await a.waitForURL(/\/home$/);
    for (const c of ['intake', 'review', 'documents', 'settings']) await a.waitForSelector(`[data-testid=card-${c}]`);
    const tasks = await a.textContent('[data-testid=tasks]');
    assert.match(tasks, /규칙 2판 확정/);
    assert.match(tasks, /문서 2건 발행/);
    assert.equal(await a.getAttribute('aside a[href="/home"]', 'aria-current'), 'page');
    await shot(a, '25-home.png');
    await a.click('aside a[href="/review"]');
    await a.waitForURL(/\/review$/);
    await a.waitForSelector('[data-testid=rule-v2]');
    assert.equal(await a.getAttribute('.triage-box[aria-current=page]', 'href'), '/review?box=rules');
    await a.click('.triage-box:has-text("답변함")');
    await a.waitForURL(/box=answered$/);
    assert.equal(await a.locator('.triage-list li').count(), 2);
    const first = await a.getAttribute('.triage-item[aria-current=true]', 'href');
    await pressUntil(a, 'j', (f) => document.querySelector('.triage-item[aria-current=true]')?.getAttribute('href') !== f, first);
    assert.match(await a.textContent('[data-testid=question]'), /판을 확정했습니다/);
    await shot(a, '25-review-triage.png');
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
    await p.locator('[data-testid=school-table] tr', { hasText: '드리미 예시학교' }).locator('button:text-is("들어가기")').click();
    await p.waitForURL(/\/home$/);
    assert.match(await p.textContent('header.top'), /전체 관리자로 보는 중/);
    assert.equal(await p.textContent('[data-testid=school-name]'), '드리미 예시학교');
    await a.goto(`${BASE}/settings`);
    assert.match(await a.textContent('[data-testid=access-log]'), /예시 전체 관리자 \(전체 관리자\) · 전체 관리자 입장/);
    // 학교 관리자는 전체 관리 화면을 열 수 없다
    assert.equal((await a.goto(`${BASE}/admin`)).status(), 404);
    await ctxP.close();
  });

  await step('DataTable: 학교 표 열 머리로 정렬(aria-sort)·행 간격 전환', async () => {
    const ctxT = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const p = await ctxT.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill('input[name=email]', 'platform@example.test');
    await p.fill('input[name=password]', 'demo-pass-p');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/admin$/);
    const names = () => p.$$eval('[data-testid=school-table] tbody tr td:first-child strong', (els) => els.map((e) => e.textContent));
    const original = await names();
    const head = p.locator('[data-testid=school-table] th', { has: p.locator('[data-sort-key=name]') });
    assert.equal(await head.getAttribute('aria-sort'), null);
    await p.click('[data-testid=school-table] [data-sort-key=name]');
    await p.waitForFunction(() => document.querySelector('[data-testid=school-table] th[aria-sort]'));
    assert.equal(await head.getAttribute('aria-sort'), 'ascending');
    const asc = await names();
    assert.deepEqual(asc, [...original].sort(new Intl.Collator('ko', { numeric: true, sensitivity: 'base' }).compare));
    await p.click('[data-testid=school-table] [data-sort-key=name]');
    await p.waitForFunction(() => document.querySelector('[data-testid=school-table] th[aria-sort=descending]'));
    assert.deepEqual(await names(), [...asc].reverse());
    // 행 간격: 촘촘히 → 행 높이 토큰 36px (두 줄 셀은 내용 높이에서 멈추므로 토큰으로 확인)
    await p.click('[role=group][aria-label="학교 목록 행 간격"] button:text-is("촘촘히")');
    await p.waitForSelector('.data-table[data-density=compact]');
    const token = await p.$eval('[data-testid=school-table] tbody tr td', (td) => getComputedStyle(td).getPropertyValue('--row-h').trim());
    assert.equal(token, '36px');
    assert.equal(await p.getAttribute('[role=group] button:text-is("촘촘히")', 'aria-pressed'), 'true');
    await shot(p, '29-datatable-sorted.png');
    await ctxT.close();
  });

  await step('17차: 개발·연구소 — 할 일 추가·완료, 종류별 탭', async () => {
    const ctxL = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    const p = await ctxL.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill('input[name=email]', 'platform@example.test');
    await p.fill('input[name=password]', 'demo-pass-p');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/admin$/);
    await p.click('aside a[href="/admin/lab"]');
    await p.waitForURL(/\/admin\/lab$/);
    assert.match(await p.textContent('[data-testid=lab-items]'), /AI 분석 프롬프트 설계/);
    await p.fill('[data-testid=quick-add] input[aria-label="새 항목 제목"]', 'E2E 할 일 확인');
    await p.click('[data-testid=quick-add] button[type=submit]');
    const row = p.locator('[data-testid=lab-items] li', { hasText: 'E2E 할 일 확인' });
    await row.waitFor();
    await row.locator('input[aria-label="끝남 표시"]').check();
    await row.waitFor({ state: 'detached' });
    await p.click('[role=tab]:has-text("방법론")');
    assert.match(await p.textContent('[data-testid=lab-items]'), /RLS 우선 설계/);
    await p.click('[role=tab]:has-text("할 일")');
    await shot(p, '10-platform-lab.png');
    await ctxL.close();
  });

  await step('39차: 관제 센터 — 결정 요청에 답하고, 연구소 항목을 세션에 지시', async () => {
    const ctxC = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    const p = await ctxC.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill('input[name=email]', 'platform@example.test');
    await p.fill('input[name=password]', 'demo-pass-p');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/admin$/);
    await p.click('aside a[href="/admin/control"]');
    await p.waitForURL(/\/admin\/control$/);
    const card = p.locator('[data-testid=control-1]');
    assert.match(await card.textContent(), /GitHub 이슈/);
    await card.locator('label.control-option', { hasText: 'QUEUE.md 유지' }).click();
    await card.locator('textarea').fill('E2E: 지금은 유지하고 다음 달에 다시 보자');
    await card.locator('button:text-is("지시 보내기")').click();
    await p.click('[role=tab]:has-text("전달·진행")');
    const sent = p.locator('[data-testid=control-1]');
    await sent.waitFor();
    assert.match(await sent.textContent(), /전달 대기/);
    assert.match(await sent.textContent(), /선택: QUEUE\.md 유지/);
    await shot(p, '39-control-center.png');
    // 개발·연구소 항목 → 세션에 지시 (세부 내용이 채워진 새 지시)
    await p.click('aside a[href="/admin/lab"]');
    await p.waitForURL(/\/admin\/lab$/);
    await p.locator('[data-testid=lab-items] li', { hasText: 'AI 분석 프롬프트 설계' }).locator('a:has-text("세션에 지시")').click();
    await p.waitForURL(/\/admin\/control\?from=/);
    const form = p.locator('[data-testid=control-compose]');
    assert.equal(await form.locator('input').first().inputValue(), 'AI 분석 프롬프트 설계와 학교당 월 비용 추정');
    await form.locator('textarea').nth(1).fill('E2E: 무료 범위에서 추정만');
    await form.locator('select').selectOption('new');
    await form.locator('button:text-is("지시 보내기")').click();
    await p.locator('[data-testid=control-list] li', { hasText: 'AI 분석 프롬프트 설계' }).waitFor();
    await ctxC.close();
  });

  await step('40차: 대화창 — 학교 관리자가 어디서나 열어 홈페이지 대화 → 전체 관리에서 보이고, 학교 시스템 요청은 승인', async () => {
    const ctxS = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    const s = await ctxS.newPage();
    await login(s, 'admin-a@school-a.test', 'demo-pass-a');
    await s.click('[data-testid=chatdock-open]');
    const dock = s.locator('[data-testid=chatdock]');
    await dock.locator('button:text-is("새 대화")').click();
    await dock.locator('label.control-option', { hasText: '홈페이지 인터페이스' }).click();
    await dock.locator('textarea').fill('E2E 첫 화면 제목을 크게');
    await dock.locator('textarea').press('Enter');
    await dock.locator('.chatdock-msg', { hasText: 'E2E 첫 화면 제목을 크게' }).waitFor();
    assert.match(await dock.locator('.chatdock-head').textContent(), /전달 대기/);
    // 시스템 기능 요청 → 승인 대기
    await dock.locator('button:text-is("새 대화")').click();
    await dock.locator('label.control-option', { hasText: '시스템 기능' }).click();
    await dock.locator('textarea').fill('E2E 성적표 내려받기');
    await dock.locator('button:text-is("보내기")').click();
    await dock.locator('.chatdock-gate', { hasText: '승인 대기' }).waitFor();
    await shot(s, '40-chatdock-school.png');
    await ctxS.close();

    const ctxP = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    const p = await ctxP.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill('input[name=email]', 'platform@example.test');
    await p.fill('input[name=password]', 'demo-pass-p');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/admin$/);
    await p.click('[data-testid=chatdock-open]');
    const pd = p.locator('[data-testid=chatdock]');
    await pd.locator('.chatdock-threads button', { hasText: 'E2E 성적표 내려받기' }).click();
    await pd.locator('.chatdock-gate button:text-is("승인")').click();
    await pd.locator('.chatdock-head', { hasText: '전달 대기' }).waitFor();
    await pd.locator('[role=tab]:has-text("전체")').click();
    assert.match(await pd.locator('.chatdock-threads').textContent(), /E2E 첫 화면 제목을 크게/);
    await shot(p, '40-chatdock-platform.png');
    await ctxP.close();
  });

  await step('22차: 학교별 개발 연동 — GitHub 저장소 연결과 세션 요청 문구', async () => {
    const ctxI = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    const p = await ctxI.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill('input[name=email]', 'platform@example.test');
    await p.fill('input[name=password]', 'demo-pass-p');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/admin$/);
    await p.click('aside a[href="/admin/integrations"]');
    await p.waitForURL(/\/admin\/integrations/);
    await p.fill('[data-testid=add-link] input >> nth=0', 'E2E 전용 저장소');
    await p.fill('[data-testid=add-link] input[aria-label="연동 주소"]', 'https://github.com/example-org/e2e-school');
    await p.click('[data-testid=add-link] button:text-is("연동 추가")');
    await p.waitForSelector('[data-testid=dev-links] >> text=E2E 전용 저장소');
    assert.match(await p.textContent('pre.copy-box >> nth=0'), /school_id: [0-9a-f-]{36}[\s\S]*github\.com\/example-org\/e2e-school/);
    await p.fill('[data-testid=add-link] input[aria-label="연동 주소"]', 'https://gitlab.com/x/y');
    await p.fill('[data-testid=add-link] input >> nth=0', '잘못된 주소');
    await p.click('[data-testid=add-link] button:text-is("연동 추가")');
    await p.waitForSelector('[role=status]:has-text("GitHub 저장소 주소 형식")');
    await shot(p, '11-platform-integrations.png');
    await ctxI.close();
  });

  await step('24차: 디자인 원형 8종 — 비교표, 전체 화면 시안, 상호작용, 학교 사용자는 접근 불가', async () => {
    const ctxD = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    const p = await ctxD.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(`${BASE}/login`);
    await p.fill('input[name=email]', 'platform@example.test');
    await p.fill('input[name=password]', 'demo-pass-p');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/admin$/);
    await p.click('aside a[href="/admin/design"]');
    await p.waitForURL(/\/admin\/design/);
    assert.equal(await p.locator('[data-testid^=archetype-]').count(), 8);
    assert.equal(await p.locator('table.ar-axes tbody tr').count(), 8);
    for (const slug of ['campus', 'command', 'launchpad', 'analytics', 'workspace', 'public', 'grid', 'triage']) {
      const res = await p.goto(`${BASE}/preview/${slug}`);
      assert.equal(res.status(), 200, slug);
      await p.waitForSelector(`[data-archetype=${slug}]`);
      await p.waitForSelector('nav.pv-bar');
      await shot(p, `24-${slug}.png`);
    }
    // 명령 팔레트: Ctrl+K로 열고 Esc로 닫는다
    await p.goto(`${BASE}/preview/command`);
    await pressUntil(p, 'Control+k', () => !!document.querySelector('[role=dialog]'));
    await p.keyboard.press('Escape');
    await p.waitForSelector('[role=dialog]', { state: 'detached' });
    // 작업함: J로 다음 질문
    await p.goto(`${BASE}/preview/triage`);
    const first = await p.textContent('section[aria-label="질문 상세"] h2');
    await pressUntil(p, 'j', (t) => document.querySelector('section[aria-label="질문 상세"] h2')?.textContent !== t, first);
    assert.deepEqual(errors, []);
    await ctxD.close();

    // 학교 사용자(전체 관리자 아님)는 시안 경로가 없다
    const ctxS = await browser.newContext();
    const s = await ctxS.newPage();
    await login(s, 'admin-a@school-a.test', 'demo-pass-a');
    const denied = await s.goto(`${BASE}/preview/campus`);
    assert.equal(denied.status(), 404);
    await ctxS.close();
  });

  await step('26차: 화면 선택 — 전체 관리는 분석형(다크) 기본, 학교는 학사 업무형, 바꾸면 DB에 저장돼 유지', async () => {
    const ctxU = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    const p = await ctxU.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill('input[name=email]', 'platform@example.test');
    await p.fill('input[name=password]', 'demo-pass-p');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/admin$/);
    await p.waitForSelector('.app[data-ui=analytics][data-mode=dark][data-scope=platform]');
    await p.waitForSelector('[data-testid=analytics-panels] svg');
    await p.click('.segmented a:text-is("7일")');
    await p.waitForURL(/days=7$/);
    assert.match(await p.textContent('[data-testid=analytics-panels]'), /최근 7일/);
    await shot(p, '26-platform-dark.png');
    // 화이트 반전: 누르면 바로 바뀌고, 새로 고쳐도 유지(DB)
    await clickUiAndSave(p, '[data-testid=ui-mode]');
    await p.waitForSelector('.app[data-mode=light]');
    await p.reload();
    await p.waitForSelector('.app[data-ui=analytics][data-mode=light]');
    await shot(p, '26-platform-light.png');
    // 화면 형식 바꾸기 → 학사 업무형, 데이터(학교 표)는 그대로
    await p.click('[data-testid=ui-menu]');
    await clickUiAndSave(p, '[data-ui-option=campus]');
    await p.waitForSelector('.app[data-ui=campus]');
    await p.reload();
    await p.waitForSelector('.app[data-ui=campus]');
    assert.match(await p.textContent('[data-testid=school-table]'), /드리미 예시학교/);
    // 전체 관리자가 학교에 들어가면 학교 범위 설정(기본: 학사 업무형)을 따른다
    await p.locator('[data-testid=school-table] tr', { hasText: '드리미 예시학교' }).locator('button:text-is("들어가기")').click();
    await p.waitForURL(/\/home$/);
    await p.waitForSelector('.app[data-ui=campus][data-mode=light][data-scope=school]');
    // 원래대로 (다른 단계에 영향 없게)
    await p.goto(`${BASE}/admin`);
    await p.click('[data-testid=ui-menu]');
    await clickUiAndSave(p, '[data-ui-option=analytics]');
    await clickUiAndSave(p, '[data-testid=ui-mode]');
    await p.waitForSelector('.app[data-ui=analytics][data-mode=dark]');
    await ctxU.close();

    // 학교 관리자: 기본 학사 업무형 → 분석형으로 바꿔도 같은 기록이 보인다
    const ctxS = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    const s = await ctxS.newPage();
    await login(s, 'admin-a@school-a.test', 'demo-pass-a');
    await s.goto(`${BASE}/home`);
    await s.waitForSelector('.app[data-ui=campus][data-mode=light]');
    const before = await s.textContent('[data-testid=card-review]');
    await s.click('[data-testid=ui-menu]');
    await clickUiAndSave(s, '[data-ui-option=analytics]');
    await s.waitForSelector('.app[data-ui=analytics]');
    await s.reload();
    await s.waitForSelector('.app[data-ui=analytics][data-mode=light]');
    assert.equal(await s.textContent('[data-testid=card-review]'), before);
    await shot(s, '26-school-analytics.png');
    await ctxS.close();
  });

  await step('30차: Claude 점검 접근 — 전체 관리자가 토큰 발급, 머리 토큰만으로 화면 읽기, 바꾸기는 거부, 폐기하면 차단', async () => {
    const ctxP = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctxP.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill('input[name=email]', 'platform@example.test');
    await p.fill('input[name=password]', 'demo-pass-p');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/admin$/);
    await p.goto(`${BASE}/admin/integrations`);
    await p.click('[data-testid=inspector-panel] button:text-is("점검 토큰 발급")');
    const token = (await p.textContent('[data-testid=issued-token]')).trim();
    assert.match(token, /^insp_[0-9a-f]{64}$/);
    // 쿠키 없이 머리 토큰만으로
    const ctxI = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'x-inspector-token': token } });
    const i = await ctxI.newPage();
    await i.goto(`${BASE}/admin`);
    await i.waitForSelector('[data-testid=school-table]');
    assert.match(await i.textContent('header.top'), /Claude 점검/);
    // 바꾸기는 DB가 막는다
    const w = await i.evaluate(async () => {
      const r = await fetch('/api/admin/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'todo', title: '점검 계정 쓰기 시도', status: 'todo' }) });
      return { status: r.status, body: await r.json() };
    });
    assert.equal(w.status, 403);
    assert.match(w.body.error, /읽기 전용/);
    // 학교에 들어가 학교 화면도 읽는다
    await i.locator('[data-testid=school-table] tr', { hasText: '드리미 예시학교' }).locator('button:text-is("들어가기")').click();
    await i.waitForURL(/\/home$/);
    await i.waitForSelector('[data-testid=card-review]');
    // 점검 계정은 입장 기록을 남기지 못하므로, 위 띠는 '접근이 기록됩니다' 대신 실제로 남는 것(토큰 마지막 사용)을 알린다
    assert.match(await i.textContent('[data-testid=inspector-banner]'), /읽기 전용.*마지막 사용/);
    assert.doesNotMatch(await i.textContent('header.top'), /접근이 기록됩니다/);
    // 폐기하면 바로 막힌다
    await p.reload();
    await p.click('[data-testid=inspector-panel] button:text-is("폐기")');
    await p.waitForSelector('[data-testid=inspector-panel] .badge:has-text("폐기됨")');
    await i.goto(`${BASE}/admin`);
    await i.waitForURL(/\/login$/);
    await ctxI.close();
    await ctxP.close();
  });

  await step('27차: 학교 홈페이지 — 라이선스로 켜고, 시안 → 공개, 방문자에게는 공개한 판만, 성품 동화 그림책', async () => {
    const ctxH = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    const h = await ctxH.newPage();
    await login(h, 'admin-a@school-a.test', 'demo-pass-a');
    // 라이선스에서 홈페이지·성품 동화 기능 켜기
    await h.goto(`${BASE}/settings`);
    await h.check('[data-testid=license] label:has-text("학교 홈페이지") input');
    await h.check('[data-testid=license] label:has-text("성품 동화") input');
    await h.click('text=라이선스 저장');
    await h.waitForSelector('[data-testid=license] .tag:has-text("3판")');
    await h.goto(`${BASE}/home`);
    await h.click('aside a[href="/site"]');
    await h.waitForURL(/\/site$/);
    // 설정: 주소·언어·열기
    await h.fill('[data-testid=site-settings] input >> nth=0', 'dreamy-a');
    await h.check('[data-testid=site-settings] label:has-text("English") input');
    await h.check('[data-testid=site-settings] label:has-text("홈페이지 열기") input');
    await h.click('text=설정 저장');
    await h.waitForSelector('[data-testid=site-settings] [role=status]:has-text("저장했습니다")');
    // 쪽 만들고 공개
    await h.click('.triage-box:has-text("쪽")');
    await h.click('[data-testid=new-entry]');
    await h.fill('.site-new input >> nth=0', '학교 소개');
    await h.fill('.site-new input >> nth=1', 'about');
    await h.click('text=시안 만들기');
    await h.waitForSelector('[data-testid=entry-editor]');
    await h.click('.block-add button:has-text("글")');
    await h.fill('.block-card textarea >> nth=0', '드리미 예시학교는 합성 예시 학교입니다.');
    await h.click('text=저장하고 공개');
    await h.waitForSelector('[data-testid=entry-editor] [role=status]:has-text("공개했습니다")');
    await h.waitForSelector('[data-testid=entry-editor] p.fine:has-text("공개 중 2판")');
    // 새 판(공개 안 함)
    await h.fill('.block-card textarea >> nth=0', '아직 공개하지 않은 2판 글');
    await h.click('text=새 판으로 저장');
    await h.waitForSelector('[data-testid=entry-editor] [role=status]:has-text("새 판으로 저장")');
    await shot(h, '27-site-admin.png');
    // 성품 동화 시안 (공개 전)
    await h.click('.triage-box:has-text("성품 동화")');
    await h.click('[data-testid=new-entry]');
    await h.fill('.site-new input >> nth=0', '비 온 뒤의 약속');
    await h.fill('.site-new input >> nth=1', 'after-rain');
    await h.fill('.site-new label:has-text("성품") input', '우정');
    await h.click('text=시안 만들기');
    await h.waitForSelector('[data-testid=entry-editor]');
    await h.click('.block-add button:has-text("동화 한 쪽")');
    await h.click('.block-add button:has-text("동화 한 쪽")');
    await h.fill('.block-card >> nth=0 >> textarea >> nth=0', '첫 쪽: 친구들이 모였어요.');
    await h.fill('.block-card >> nth=1 >> textarea >> nth=0', '둘째 쪽: 비가 와도 약속은 남아요.');
    await h.click('text=새 판으로 저장');
    await h.waitForSelector('[data-testid=entry-editor] [role=status]:has-text("새 판으로 저장")');

    // 방문자(로그인 없음)
    const ctxV = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const v = await ctxV.newPage();
    await v.goto(`${BASE}/s/dreamy-a`);
    assert.match(await v.textContent('.site-nav'), /학교 소개/);
    await v.goto(`${BASE}/s/dreamy-a/p/about`);
    const body = await v.textContent('.site-main');
    assert.match(body, /합성 예시 학교/);
    assert.doesNotMatch(body, /2판 글/);
    assert.equal((await v.goto(`${BASE}/s/dreamy-a/stories/after-rain`)).status(), 404);
    // 관리자가 동화 공개 → 방문자 그림책
    await h.click('text=최신 판 공개');
    await h.waitForSelector('[data-testid=entry-editor] [role=status]:has-text("공개했습니다")');
    await v.goto(`${BASE}/s/dreamy-a/stories`);
    assert.match(await v.textContent('[data-testid=site-list]'), /비 온 뒤의 약속.*우정/s);
    await v.goto(`${BASE}/s/dreamy-a/stories/after-rain?lang=en`);
    await v.waitForSelector('[data-testid=storybook]');
    assert.equal(await v.textContent('[data-testid=storybook-count]'), '1 / 2');
    await v.click('[data-testid=storybook] button[aria-label="Next"]');
    assert.equal(await v.textContent('[data-testid=storybook-count]'), '2 / 2');
    assert.match(await v.textContent('.storybook-text'), /약속은 남아요/);
    await shot(v, '27-site-story.png');
    // 없는 사이트·다른 학교: 기능이 꺼진 B는 관리 화면이 잠겨 있다
    assert.equal((await v.goto(`${BASE}/s/no-such-school`)).status(), 404);
    await ctxV.close();
    const ctxB2 = await browser.newContext();
    const b2 = await ctxB2.newPage();
    await b2.goto(`${BASE}/login`);
    await b2.fill('input[name=email]', 'admin-b@school-b.test');
    await b2.fill('input[name=password]', 'demo-pass-b');
    await b2.click('button[type=submit]');
    await b2.waitForURL(/\/home$/);
    await b2.goto(`${BASE}/site`);
    await b2.waitForURL(/\/locked\?module=homepage/);
    await ctxB2.close();
    await ctxH.close();
  });

  await step('31차: 기존 홈페이지 가져오기 — 묶음 zip → 시안 → 모두 공개, 새벽빛 화면·갤러리·옛 주소·후원자 숨은 쪽', async () => {
    const ctxH = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    const h = await ctxH.newPage();
    await login(h, 'admin-a@school-a.test', 'demo-pass-a');
    await h.goto(`${BASE}/site?box=settings`);
    await h.setInputFiles('[data-testid=import-file]', { name: 'export.zip', mimeType: 'application/zip', buffer: makeExportZip() });
    const plan = await h.textContent('[data-testid=import-plan]');
    assert.match(plan, /쪽 7개 · 숨은 쪽\(후원자\) 2개 · 소식 1개 · 동화 1편 · 그림 10장/);
    assert.match(plan, /성품 이름/);
    await h.click('[data-testid=import-run]');
    await h.waitForSelector('[data-testid=import-done]', { timeout: 60000 });
    assert.match(await h.textContent('[data-testid=import-done]'), /시안 11개/);
    // 공개 전: 방문자에게 가져온 쪽이 없다 (27차에서 만든 about 은 새 판만 더해졌고 공개본은 그대로)
    const ctxV = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const v = await ctxV.newPage();
    assert.equal((await v.goto(`${BASE}/s/dreamy-a/p/gallery`)).status(), 404);
    await h.click('[data-testid=import-publish]');
    await h.waitForSelector('[data-testid=import-published]', { timeout: 60000 });
    await shot(h, '31-import.png');
    // 방문자: 새벽빛 첫 화면(태국어 기본), 로고·바닥 정보, 최근 소식
    await v.goto(`${BASE}/s/dreamy-a`);
    await v.waitForSelector('.site[data-theme=dawn] .site-opening');
    assert.match(await v.textContent('h1'), /ไทย Dawn Example\./);
    assert.ok(await v.locator('.site-brand img').count());
    assert.match(await v.textContent('.site-footer'), /000-0000000/);
    assert.match(await v.textContent('[data-testid=news-list]'), /Choosing colours/);
    assert.doesNotMatch(await v.textContent('.site-nav'), /후원자|Supporters/);
    await shot(v, '31-dawn-home.png');
    // 갤러리: 묶음 거르기 + 크게 보기(Esc로 닫힘)
    await v.goto(`${BASE}/s/dreamy-a/p/gallery?lang=en`);
    await v.click('.gallery-filter button:text-is("Art")');
    await v.waitForFunction(() => document.querySelectorAll('.gallery-tile').length === 1);
    assert.equal(await v.getAttribute('.gallery-filter button:text-is("Art")', 'aria-pressed'), 'true');
    await v.click('.gallery-tile');
    await v.waitForSelector('dialog.photo-dialog[open]');
    await v.keyboard.press('Escape');
    await v.waitForSelector('dialog.photo-dialog:not([open])', { state: 'attached' });
    await shot(v, '31-dawn-gallery.png');
    // 옛 주소 호환: /about → /p/about, /friends/letters/<id> → 숨은 쪽(한국어)
    await v.goto(`${BASE}/s/dreamy-a/curriculum?lang=ko`);
    assert.match(v.url(), /\/s\/dreamy-a\/p\/curriculum\?lang=ko$/);
    await v.goto(`${BASE}/s/dreamy-a/friends/letters/welcome`);
    assert.match(v.url(), /\/p\/friends-letter-welcome\?lang=ko$/);
    assert.match(await v.textContent('.site-main'), /합성 편지 글/);
    assert.equal(await v.locator('.site-nav').count(), 0);
    assert.equal(await v.getAttribute('meta[name=robots]', 'content'), 'noindex, nofollow');
    await shot(v, '31-friends.png');
    // 동화: 그림 안 글 → 글은 화면 읽기용
    await v.goto(`${BASE}/s/dreamy-a/stories/dawn-story`);
    await v.waitForSelector('[data-testid=storybook] .storybook-text.sr-only');
    // 32차: 가져온 동화는 성품 이름이 비어 있다 → 관리자가 편집 화면에서 정하면 공개 목록에 바로 보인다
    await h.goto(`${BASE}/site?box=story`);
    await h.click('.triage-item:has-text("นิทานตัวอย่าง"), .triage-item:has-text("예시 동화")');
    await h.fill('[data-testid=story-meta] label:has-text("성품 이름") input', '우정');
    await h.click('[data-testid=story-meta] button:text-is("성품 정보 저장")');
    await h.waitForSelector('[data-testid=story-meta] [role=status]:has-text("저장했습니다")');
    await v.goto(`${BASE}/s/dreamy-a/stories?lang=ko`);
    assert.match(await v.textContent('[data-testid=site-list]'), /우정/);
    await ctxV.close();
    await ctxH.close();
  });

  await step('34·36차: AI 작업 공간 — 관리자 발급 → 스크립트가 토큰으로 캐릭터 PNG·PDF 올리고 시안 → 범위 밖 거부 → 관리자 공개 → 방문자 PDF 내려받기 → 폐기', async () => {
    const ctxH = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    const h = await ctxH.newPage();
    await login(h, 'admin-a@school-a.test', 'demo-pass-a');
    await h.goto(`${BASE}/site?box=settings`);
    // 36차: AI 작업 공간 — 종류(동화) × 항목(after-rain) × 권한(기본: 읽기·파일 올리기·시안 저장), 에이전트 Codex
    assert.match(await h.textContent('[data-testid=agent-tokens] h2'), /AI 작업 공간/);
    await h.check('[data-testid=agent-token-keys] label:has-text("/after-rain") input');
    await h.click('[data-testid=agent-token-issue]');
    const token = (await h.textContent('[data-testid=agent-token-value]')).trim();
    assert.match(token, /^agt_[0-9a-f]{64}$/);
    await h.waitForSelector('[data-testid=agent-token-list] td:has-text("/after-rain")');
    await shot(h, '34-agent-token.png');
    // 합성 작업 폴더 (실제 동화 아님): 캐릭터 PNG 1장 + PDF 1개 + manifest
    const work = fs.mkdtempSync(path.join(ROOT, '.e2e-agent-'));
    try {
      const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
      const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1');
      fs.mkdirSync(path.join(work, 'characters'));
      fs.writeFileSync(path.join(work, 'characters', 'rabbit.png'), PNG);
      fs.writeFileSync(path.join(work, 'after-rain.pdf'), PDF);
      fs.writeFileSync(path.join(work, 'manifest.json'), JSON.stringify({
        story_key: 'after-rain', note: 'E2E 합성 캐릭터·PDF',
        characters: { title: { ko: '등장인물', en: 'Characters' }, items: [{ file: 'characters/rabbit.png', name: { ko: '토끼 단비', en: 'Danbi the rabbit' }, body: { ko: '약속을 지키는 친구' } }] },
        pdfs: [{ file: 'after-rain.pdf', label: { ko: '동화 PDF 내려받기', en: 'Download the storybook' }, note: { ko: '인쇄용 아님(웹용)' } }],
      }));
      const out = execFileSync('node', ['scripts/agent-story-upload.mjs', work], { cwd: ROOT, env: { ...process.env, SCHOOL_AGENT_TOKEN: token, ONSCHOOLS_URL: BASE }, encoding: 'utf8' });
      assert.match(out, /새 판 저장: \d+판 \(시안, 공개 안 됨\)/);
      assert.doesNotMatch(out, /agt_/); // 토큰 원문을 출력하지 않는다
    } finally { fs.rmSync(work, { recursive: true, force: true }); }
    // 범위 밖·사람 전용 경로는 거부
    const call = (p, init = {}) => fetch(`${BASE}${p}`, { ...init, headers: { 'x-agent-token': token, 'content-type': 'application/json', ...(init.headers ?? {}) } });
    assert.equal((await call('/api/agent/stories/dawn-story/versions', { method: 'POST', body: JSON.stringify({ content: { title: { ko: 'x' }, blocks: [] } }) })).status, 403);
    assert.equal((await call('/api/agent/stories/dawn-story')).status, 404);
    // 36차 일반 경로: 같은 범위 규칙
    assert.equal((await call('/api/agent/entries/story/after-rain')).status, 200);
    assert.equal((await call('/api/agent/entries/page/about')).status, 403); // 이 토큰은 동화만
    assert.equal((await call('/api/agent/entries/settings')).status, 404);
    const entries = await (await fetch(`${BASE}/api/site/assets`, { headers: { 'x-agent-token': token } })).status;
    assert.equal(entries, 401); // 사람 경로는 토큰을 받지 않는다
    assert.equal((await call('/api/agent/me', { headers: { cookie: 'sp_session=x' } })).status, 400);
    // 방문자에게는 아직 PDF가 없다 → 관리자가 시안 확인 후 공개
    const ctxV = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const v = await ctxV.newPage();
    await v.goto(`${BASE}/s/dreamy-a/stories/after-rain`);
    assert.equal(await v.locator('[data-testid=download-block]').count(), 0);
    await h.goto(`${BASE}/site?box=story`);
    await h.click('.triage-item:has-text("비 온 뒤의 약속")');
    await h.waitForSelector('[data-testid=entry-editor]');
    assert.match(await h.textContent('[data-testid=entry-editor]'), /작업 토큰/);
    await h.click('text=최신 판 공개');
    await h.waitForSelector('[data-testid=entry-editor] [role=status]:has-text("공개했습니다")');
    await v.goto(`${BASE}/s/dreamy-a/stories/after-rain?lang=ko`);
    await v.waitForSelector('[data-testid=download-block]');
    assert.match(await v.textContent('.site-main'), /토끼 단비/);
    assert.match(await v.textContent('[data-testid=download-block]'), /동화 PDF 내려받기.*PDF/s);
    const [dl] = await Promise.all([v.waitForEvent('download'), v.click('[data-testid=download-block] a')]);
    assert.equal(dl.suggestedFilename(), 'after-rain.pdf');
    const href = await v.getAttribute('[data-testid=download-block] a', 'href');
    const res = await fetch(`${BASE}${href}`);
    assert.equal(res.headers.get('content-disposition'), 'attachment');
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    await shot(v, '34-story-download.png');
    // 폐기하면 바로 막힌다
    await h.goto(`${BASE}/site?box=settings`);
    await h.click('[data-testid=agent-token-list] button:text-is("폐기")');
    await h.waitForSelector('[data-testid=agent-token-list] .badge:has-text("폐기")');
    assert.equal((await call('/api/agent/me')).status, 401);
    await ctxV.close();
    await ctxH.close();
  });

  await step('38차: 토큰 권한 확장 — 무기한·만들기·보관 발급 → 에이전트가 새 동화 만들고 구조 바꿈 → 관리자 공개 → 내림 → 에이전트 보관 → 관리자 되살리기', async () => {
    const ctxH = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    const h = await ctxH.newPage();
    await login(h, 'admin-a@school-a.test', 'demo-pass-a');
    await h.goto(`${BASE}/site?box=settings`);
    await h.selectOption('[data-testid=agent-token-days]', 'none');
    await h.waitForSelector('[data-testid=agent-token-long-warning]');
    await h.check('[data-testid=agent-token-perms] label:has-text("만들기") input');
    await h.check('[data-testid=agent-token-perms] label:has-text("보관") input');
    await h.click('[data-testid=agent-token-issue]');
    const token = (await h.textContent('[data-testid=agent-token-value]')).trim();
    await h.waitForSelector('[data-testid=agent-token-list] td:text-is("무기한")');
    await shot(h, '38-agent-token.png');
    const call = async (p, method = 'GET', body) => {
      const r = await fetch(`${BASE}${p}`, { method, headers: { 'x-agent-token': token, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    };
    const made = await call('/api/agent/entries/story', 'POST', { key: 'moon-promise', meta: { virtue: '신뢰', character: '부엉이' },
      content: { title: { ko: '달빛 약속' }, blocks: [{ type: 'story_page', text: { ko: '첫 쪽: 달이 떴어요.' } }, { type: 'story_page', text: { ko: '둘째 쪽: 약속을 지켜요.' } }] } });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    assert.equal((await call('/api/agent/entries/story', 'POST', { key: 'moon-promise', content: { title: { ko: 'x' }, blocks: [] } })).status, 409);
    const ed = await call('/api/agent/entries/story/moon-promise/edit', 'POST', { base_version: 1, ops: [
      { op: 'insert', at: 2, block: { type: 'section', template: 'text', title: { ko: '이야기를 마치며' }, body: { ko: '합성 예시 글' } } }, { op: 'move', from: 1, to: 0 }] });
    assert.equal(ed.status, 200, JSON.stringify(ed.body));
    assert.equal((await call('/api/agent/entries/story/moon-promise/edit', 'POST', { base_version: 1, ops: [{ op: 'hide', index: 0 }] })).status, 409);
    // 관리자 공개 → 방문자
    await h.goto(`${BASE}/site?box=story`);
    await h.click('.triage-item:has-text("달빛 약속")');
    await h.waitForSelector('[data-testid=entry-editor]');
    await h.click('text=최신 판 공개');
    await h.waitForSelector('[data-testid=entry-editor] [role=status]:has-text("공개했습니다")');
    const ctxV = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const v = await ctxV.newPage();
    await v.goto(`${BASE}/s/dreamy-a/stories/moon-promise?lang=ko`);
    await v.waitForSelector('[data-testid=storybook]');
    assert.match(await v.textContent('.storybook-text'), /둘째 쪽/); // 구조 바꾸기(순서)가 반영
    assert.match(await v.textContent('.site-main'), /이야기를 마치며/);
    // 공개 중에는 에이전트가 보관 못 함 → 관리자가 내린 뒤 보관
    assert.equal((await call('/api/agent/entries/story/moon-promise/archive', 'POST')).status, 409);
    await h.click('button:text-is("공개 내리기")');
    await h.waitForSelector('[data-testid=entry-editor] [role=status]:has-text("공개를 내렸습니다")');
    assert.equal((await call('/api/agent/entries/story/moon-promise/archive', 'POST')).status, 200);
    assert.equal((await v.goto(`${BASE}/s/dreamy-a/stories/moon-promise`)).status(), 404);
    // 관리자: 보관함에서 되살리기
    await h.goto(`${BASE}/site?box=story`);
    await h.waitForSelector('[data-testid=archive-box]');
    await h.click('[data-testid=archive-box] summary');
    await h.click('[data-testid=archive-box] .triage-item:has-text("달빛 약속")');
    await h.waitForSelector('[data-testid=archive-control] button:has-text("되살리기")');
    await shot(h, '38-archive.png');
    await h.click('[data-testid=archive-control] button:has-text("되살리기")');
    await h.waitForSelector('[data-testid=archive-control] button:has-text("보관함으로")');
    assert.equal(await h.locator('[data-testid=archive-box]').count(), 0);
    assert.equal((await call('/api/agent/entries/story/moon-promise')).status, 200);
    await ctxV.close();
    await ctxH.close();
  });

  await step('35차: 화면 편집 — 그 자리에서 글 고치기·언어 전환·구역 끼워 넣기·숨기기·키보드로 옮기기·사진 올리기 → 공개 → 방문자 반영', async () => {
    const ctxH = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    const h = await ctxH.newPage();
    await login(h, 'admin-a@school-a.test', 'demo-pass-a');
    await h.goto(`${BASE}/site?box=page`);
    await h.click('.triage-item:has(.triage-item-sub:text-is("/about"))');
    await h.click('[data-testid=live-edit-link]');
    await h.waitForURL(/\/site\/edit\/[0-9a-f-]{36}$/);
    const editUrl = h.url();
    await h.waitForSelector('[data-testid=live-editor] .site h1 .le-text');
    await h.click('.le-langs button:text-is("한국어")');
    // 글 바로 고치기 (쪽 제목)
    await h.locator('.site-head h1 .le-text').fill('합성 화면 편집 제목');
    await h.waitForSelector('[data-testid=le-dirty]');
    // 레이아웃 가이드: '알림'과 '제목'을 끼워 넣고 바로 적는다
    await h.click('[data-testid=le-guide-toggle]');
    const before = await h.locator('[data-testid=le-block]').count();
    await h.click('[data-palette=notice]');
    await h.waitForFunction((t) => document.activeElement?.classList.contains('le-text') && !document.activeElement.textContent && document.activeElement.closest('[data-block-index]')?.dataset.blockIndex === t, String(before));
    await h.keyboard.type('화면에서 넣은 합성 알림');
    await h.click('[data-palette=heading]');
    await h.waitForFunction((t) => document.activeElement?.classList.contains('le-text') && !document.activeElement.textContent && document.activeElement.closest('[data-block-index]')?.dataset.blockIndex === t, String(before + 1));
    await h.keyboard.type('숨길 합성 구역');
    assert.equal(await h.locator('[data-testid=le-block]').count(), before + 2);
    // 숨기기 (마지막 '제목' 구역)
    await h.click(`[data-block-index="${before + 1}"] .le-bar button[aria-label="${before + 2}번 구역 숨기기"]`);
    assert.equal(await h.getAttribute(`[data-block-index="${before + 1}"]`, 'data-hidden'), 'true');
    assert.match(await h.textContent('[data-testid=le-outline]'), /숨김/);
    // 키보드로 옮기기: '알림' 손잡이에서 ↑ → 한 칸 위, 초점은 옮긴 구역 손잡이에 남는다
    await h.focus(`[data-grip="${before}"]`);
    await h.keyboard.press('ArrowUp');
    await h.waitForFunction((i) => document.querySelector(`[data-block-index="${i}"]`)?.textContent?.includes('화면에서 넣은 합성 알림'), before - 1);
    assert.equal(await h.evaluate(() => document.activeElement?.getAttribute('data-grip')), String(before - 1));
    // 언어 전환: 영어에는 알림 글이 없어 기본 언어 글을 흐리게 보인다(점선 표시)
    await h.click('.le-langs button:text-is("English")');
    assert.equal(await h.getAttribute(`[data-block-index="${before - 1}"] .le-text`, 'data-state'), 'missing');
    await h.locator(`[data-block-index="${before - 1}"] .le-text`).fill('Synthetic notice added on the page');
    await h.click('.le-langs button:text-is("한국어")');
    // 사진 바꾸기: 첫 사진 칸에서 사진함을 열고 새 사진을 올리면 바로 바뀐다
    const photoBtn = h.locator('.le-photo-btn').first();
    const photoIdx = await photoBtn.evaluate((el) => el.closest('[data-block-index]')?.getAttribute('data-block-index'));
    await photoBtn.click();
    await h.waitForSelector('[data-testid=le-picker][open]');
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000002000000020806000000f478d4fa0000001549444154789c63f8cfc0f01f0418181818fe03000c1a02fe3e5a6c4d0000000049454e44ae426082', 'hex');
    const up = h.waitForResponse((r) => r.url().endsWith('/api/site/assets') && r.request().method() === 'POST');
    await h.setInputFiles('[data-testid=le-picker] input[type=file]', { name: 'synthetic.png', mimeType: 'image/png', buffer: png });
    const asset = await (await up).json();
    await h.waitForSelector(`[data-testid=le-picker] .le-assets button[aria-pressed=true] img[src="/site/assets/${asset.id}"]`);
    await h.click('[data-testid=le-picker] button:text-is("다 했어요")');
    await h.waitForSelector('[data-testid=le-picker]', { state: 'detached' });
    assert.ok(await h.locator(`[data-block-index="${photoIdx}"] img[src="/site/assets/${asset.id}"]`).count());
    // 구역 설정: 카드 항목 순서 바꾸기 (화면의 카드 순서가 바로 바뀐다)
    const cardsIdx = await h.locator('[data-testid=le-block]:has(.sec-cards)').first().getAttribute('data-block-index');
    const cardTitles = () => h.locator(`[data-block-index="${cardsIdx}"] .sec-cards > li h3`).allTextContents();
    await h.click(`[data-block-index="${cardsIdx}"] .le-bar button[aria-label="${Number(cardsIdx) + 1}번 구역 설정"]`);
    await h.click(`[data-block-index="${cardsIdx}"] [data-testid=le-settings] button:has-text("항목 더하기")`);
    await h.locator(`[data-block-index="${cardsIdx}"] .sec-cards > li:last-child h3 .le-text`).fill('합성 새 카드');
    await h.locator(`[data-block-index="${cardsIdx}"] .sec-cards > li:first-child h3 .le-text`).fill('합성 첫 카드');
    const t0 = await cardTitles();
    await h.click(`[data-block-index="${cardsIdx}"] [data-testid=le-settings] button[aria-label="1번 항목 아래로"]`);
    assert.deepEqual((await cardTitles()).slice(0, 2), [t0[1], t0[0]]);
    await shot(h, '35-live-edit.png');
    // 방문자 모습 보기: 숨긴 구역이 빠진다
    await h.click('[data-testid=le-mode]');
    assert.doesNotMatch(await h.textContent('.le-canvas'), /숨길 합성 구역/);
    await h.click('[data-testid=le-mode]');
    // 저장하고 공개 → 방문자
    await h.click('[data-testid=le-publish]');
    await h.waitForSelector('[data-testid=le-msg]:has-text("공개했습니다")');
    // 새로 고침으로 새 판이 오면 '저장 안 한 변경' 표시가 사라지고 공개 판 번호가 최신 판과 같다
    await h.waitForSelector('[data-testid=le-dirty]', { state: 'detached' });
    const head = await h.textContent('[data-testid=le-toolbar] p.fine');
    const [, latestV, liveV] = head.match(/최신 (\d+)판 · 공개 중 (\d+)판/);
    assert.equal(latestV, liveV);
    const ctxV = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const v = await ctxV.newPage();
    await v.goto(`${BASE}/s/dreamy-a/p/about?lang=ko`);
    const main = await v.textContent('.site-main');
    assert.match(main, /합성 화면 편집 제목/);
    assert.match(main, /화면에서 넣은 합성 알림/);
    assert.doesNotMatch(main, /숨길 합성 구역/);
    assert.ok(await v.locator(`img[src="/s/dreamy-a/a/${asset.id}"]`).count());
    await v.goto(`${BASE}/s/dreamy-a/p/about?lang=en`);
    assert.match(await v.textContent('.site-main'), /Synthetic notice added on the page/);
    await ctxV.close();
    // 병행 규칙(ADR 0013): 화면을 연 뒤 다른 곳에서 새 판이 저장되면, 내 저장은 막히고 내 고침은 화면에 남는다 → 최신 판 위에 저장
    await h.reload();
    await h.waitForSelector('[data-testid=live-editor] .site h1 .le-text');
    const entryId = editUrl.split('/').pop();
    const opened = Number((await h.textContent('[data-testid=le-toolbar] p.fine')).match(/최신 (\d+)판/)[1]);
    const other = await h.evaluate(async ([id, base]) => {
      const d = await (await fetch(`/api/site/entries/${id}/versions`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ base_version: base, note: '다른 곳에서 저장', content: { title: { ko: '다른 곳 제목' }, blocks: [] } }) })).json();
      return d.version;
    }, [entryId, opened]);
    assert.equal(other, opened + 1);
    await h.locator('.site-head h1 .le-text').fill('내 화면 편집 제목');
    await h.click('[data-testid=le-save]');
    await h.waitForSelector('[data-testid=le-conflict]');
    await h.waitForSelector(`[data-testid=le-conflict]:has-text("${opened + 1}판")`);
    assert.equal(await h.textContent('.site-head h1 .le-text'), '내 화면 편집 제목');
    await h.click('[data-testid=le-conflict] button:has-text("내 고침을 최신 판 위에 저장")');
    await h.waitForSelector('[data-testid=le-conflict]', { state: 'detached' });
    await h.waitForSelector(`[data-testid=le-toolbar] p.fine:has-text("최신 ${opened + 2}판")`);
    assert.equal(await h.textContent('.site-head h1 .le-text'), '내 화면 편집 제목');
    // 휴대폰 폭: 레이아웃 가이드가 아래쪽 시트로 열린다
    await h.setViewportSize({ width: 390, height: 844 });
    await h.reload();
    await h.click('[data-testid=le-guide-toggle]');
    assert.equal(await h.evaluate(() => getComputedStyle(document.querySelector('[data-testid=le-guide]')).position), 'fixed');
    await shot(h, '35-live-edit-mobile.png');
    await ctxH.close();
    // 다른 학교(B, 홈페이지 기능 꺼짐)는 이 편집 주소로 들어오지 못한다
    const ctxB3 = await browser.newContext();
    const b3 = await ctxB3.newPage();
    await b3.goto(`${BASE}/login`);
    await b3.fill('input[name=email]', 'admin-b@school-b.test');
    await b3.fill('input[name=password]', 'demo-pass-b');
    await b3.click('button[type=submit]');
    await b3.waitForURL(/\/home$/);
    await b3.goto(editUrl);
    await b3.waitForURL(/\/locked\?module=homepage/);
    const r = await b3.request.post(`${editUrl.replace('/site/edit/', '/api/site/entries/')}/versions`, { data: { content: { title: { ko: '침입' }, blocks: [] } } });
    assert.ok(r.status() >= 400, `B 학교의 시안 저장이 거부되어야 함: ${r.status()}`);
    await ctxB3.close();
  });

  await step('접근성(axe): 앱·시안(/preview/*) 화면 모두 심각도 serious 이상 위반 0건', async () => {
    const line = (f) => `  [${f.impact}] ${f.page} (${f.path}) ${f.id}: ${f.help} · ${f.count}곳 · ${f.targets.join(' | ')}`;
    if (axeFindings.length) console.error(axeFindings.map(line).join('\n'));
    assert.equal(axeFindings.length, 0, `axe serious 이상 위반 ${axeFindings.length}건`);
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
