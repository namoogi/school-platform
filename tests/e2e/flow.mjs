// 14차 전체 흐름 E2E: 실제 Next 서버 + 로컬 Postgres + Chromium.
// 학교별 로그인 → 자료 누적 등록(파일 선택·끌어 놓기·시트 주소) → 근거 질문과 수정 → 발행 → 재로그인 후 복원
// → 규칙 수정 후 수정본 발행과 첫 발행본 보존 → 두 학교 간 HTTP 접근 거부(양방향).
// 실행: npm run build && npm run test:e2e   (SCREENSHOT_DIR 지정 시 화면 저장)
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';
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

  let bLangChecked = false;
  // 122차: 공개 단추를 누르면 공개 창이 사진 목록을 묻는다(/api/site/photos). 사진이 있으면 허가 확인을 체크하고 공개한다.
  async function withConsent(page, action) {
    const asked = page.waitForResponse((r) => r.url().endsWith('/api/site/photos') && r.request().method() === 'POST', { timeout: 30000 });
    await action();
    const data = await (await asked).json();
    if (data.photos?.length) {
      await page.waitForSelector('[data-testid=photo-consent-dialog]');
      assert.equal(await page.isDisabled('[data-testid=photo-consent-confirm]'), true); // 체크 전에는 공개할 수 없다
      await page.check('[data-testid=photo-consent-check]');
      await page.click('[data-testid=photo-consent-confirm]');
    }
    return data.photos?.length ?? 0;
  }

  async function login(page, email, password) {
    await page.goto(`${BASE}/login`);
    await page.fill('input[name=email]', email);
    await page.fill('input[name=password]', password);
    await page.click('button[type=submit]');
    await page.waitForURL(/\/home$/);
    // 96차(ADR 0038 5항): 영어 학교 B는 화면 언어를 고르지 않으면 영어로 열린다. 처음 한 번 확인한 뒤,
    // 이 시험의 한국어 기준 단계를 위해 B 관리자의 화면 언어를 한국어로 고른다(사용자 설정이 학교 기본보다 앞선다)
    if (email.startsWith('admin-b@')) {
      if (!bLangChecked) {
        assert.equal(await page.locator('.app').getAttribute('lang'), 'en', '영어 학교 B는 영어 화면으로 열린다');
        bLangChecked = true;
      }
      const r = await page.evaluate(() => fetch('/api/preferences/lang', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang: 'ko' }) }).then((x) => x.status));
      assert.equal(r, 200);
    }
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
    // 직전 업로드의 완료·새로고침 뒤 활성화된 단추에 키를 보낸다.
    const chooseButton = a.locator('[data-testid=dropzone] button:not(:disabled)').first();
    await chooseButton.waitFor({ state: 'visible' });
    const [chooser] = await Promise.all([a.waitForEvent('filechooser'), chooseButton.press('Enter')]);
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
    await a.mouse.move(1000, 450); // 120차 펼침 메뉴: 마우스가 메뉴 위에 남으면 메뉴가 펼쳐져 본문 왼쪽을 덮는다(사람처럼 본문으로 옮김)
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
    await p.mouse.move(1000, 450); // 120차 펼침 메뉴: 마우스가 메뉴 위에 남으면 메뉴가 펼쳐져 본문 왼쪽을 덮는다(사람처럼 본문으로 옮김)
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
    await p.mouse.move(1000, 450); // 120차 펼침 메뉴: 마우스가 메뉴 위에 남으면 메뉴가 펼쳐져 본문 왼쪽을 덮는다(사람처럼 본문으로 옮김)
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
    await p.mouse.move(1000, 450); // 120차 펼침 메뉴: 마우스가 메뉴 위에 남으면 메뉴가 펼쳐져 본문 왼쪽을 덮는다(사람처럼 본문으로 옮김)
    await p.waitForURL(/\/admin\/lab$/);
    // 81차: 카드 → 상세 → 맨 아래 지침(관제 센터 '지시'와 같은 길, 연구소 항목 연결)
    await p.locator('[data-testid=lab-items] li', { hasText: 'AI 분석 프롬프트 설계' }).locator('a.item-title').click();
    await p.waitForURL(/\/admin\/lab\/[0-9a-f-]{36}$/);
    const form = p.locator('[data-testid=directive-form]');
    await form.locator('textarea').fill('E2E: 무료 범위에서 추정만');
    await form.locator('select').selectOption('new');
    await form.locator('button[type=submit]').click();
    await p.locator('[data-testid=lab-directives] .lab-msg', { hasText: 'E2E: 무료 범위에서 추정만' }).waitFor();
    await p.goto(`${BASE}/admin/control`);
    await p.click('[role=tab]:has-text("전달·진행")');
    await p.locator('[data-testid=control-list] li', { hasText: 'AI 분석 프롬프트 설계' }).waitFor();
    await ctxC.close();
  });

  await step('41차: 대화창 — 학교 관리자가 어디서나 열어 홈페이지 대화 → 전체 관리에서 보이고, 학교 시스템 요청은 승인', async () => {
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

  await step('43차: 사용량·저장소 — 학교별 사용량·월 추정, R2 설정 전 안내', async () => {
    const ctxU = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    const p = await ctxU.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill('input[name=email]', 'platform@example.test');
    await p.fill('input[name=password]', 'demo-pass-p');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/admin$/);
    await p.click('aside a[href="/admin/usage"]');
    await p.mouse.move(1000, 450); // 120차 펼침 메뉴: 마우스가 메뉴 위에 남으면 메뉴가 펼쳐져 본문 왼쪽을 덮는다(사람처럼 본문으로 옮김)
    await p.waitForURL(/\/admin\/usage$/);
    assert.match(await p.textContent('[data-testid=usage-table]'), /드리미 예시학교/);
    assert.match(await p.textContent('[data-testid=storage-card]'), /설정 전/);
    await shot(p, '43-usage.png');
    await ctxU.close();
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
    await p.mouse.move(1000, 450); // 120차 펼침 메뉴: 마우스가 메뉴 위에 남으면 메뉴가 펼쳐져 본문 왼쪽을 덮는다(사람처럼 본문으로 옮김)
    await p.waitForURL(/\/admin\/integrations/);
    // 사이드바 링크를 누른 마우스가 메뉴 위에 남으면 펼쳐진 메뉴가 본문 단추를 가린다(CI 흔들림 두 번) — 본문으로 옮긴다
    await p.mouse.move(1000, 600);
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
    await p.mouse.move(1000, 450); // 120차 펼침 메뉴: 마우스가 메뉴 위에 남으면 메뉴가 펼쳐져 본문 왼쪽을 덮는다(사람처럼 본문으로 옮김)
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

  await step('30차·51차: 관제 세션 접근 — 전체 관리자가 토큰 발급, 머리 토큰만으로 전체 관리자로 일함(ADR 0024), 폐기하면 차단', async () => {
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
    assert.match(await i.textContent('header.top'), /Claude 관제 세션/);
    // 51차: 관제 세션은 전체 관리자 — 바꾸기도 된다
    const w = await i.evaluate(async () => {
      const r = await fetch('/api/admin/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'todo', title: '점검 계정 쓰기 시도', status: 'todo' }) });
      return { status: r.status, body: await r.json() };
    });
    assert.equal(w.status, 200, JSON.stringify(w.body));
    // 학교에 들어가 학교 화면도 읽는다
    await i.locator('[data-testid=school-table] tr', { hasText: '드리미 예시학교' }).locator('button:text-is("들어가기")').click();
    await i.waitForURL(/\/home$/);
    await i.waitForSelector('[data-testid=card-review]');
    assert.match(await i.textContent('[data-testid=inspector-banner]'), /관제 세션\(전체 관리자\).*기록/);
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
    await h.mouse.move(1000, 450); // 120차 펼침 메뉴: 마우스가 메뉴 위에 남으면 메뉴가 펼쳐져 본문 왼쪽을 덮는다(사람처럼 본문으로 옮김)
    await h.waitForURL(/\/site$/);
    // 설정: 주소·언어·열기
    await h.fill('[data-testid=site-settings] input >> nth=0', 'dreamy-a');
    await h.check('[data-testid=site-settings] label:has-text("English") input');
    await h.check('[data-testid=site-settings] label:has-text("홈페이지 열기") input');
    await h.click('text=설정 저장');
    await h.waitForSelector('[data-testid=site-settings] [role=status]:has-text("저장했습니다")');
    // 88차: 표시를 넘겨받은 뒤 주소의 saved=1은 지워진다(새로 고침하면 표시가 다시 나오지 않음)
    await h.waitForFunction(() => !location.search.includes('saved='));
    // 쪽 만들고 공개
    await h.click('.triage-box:has-text("쪽")');
    await h.click('[data-testid=new-entry]');
    await h.fill('.site-new input >> nth=0', '학교 소개');
    await h.fill('.site-new input >> nth=1', 'hello'); // 50차: 가져오기 묶음에 없는 주소(사람이 만든 about 은 가져오기가 빈 칸만 채우므로)
    await h.click('text=시안 만들기');
    await h.waitForSelector('[data-testid=entry-editor]');
    await h.click('.block-add button:has-text("글")');
    await h.fill('.block-card textarea >> nth=0', '드리미 예시학교는 합성 예시 학교입니다.');
    await withConsent(h, () => h.click('text=저장하고 공개'));
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
    await v.goto(`${BASE}/s/dreamy-a/p/hello`);
    const body = await v.textContent('.site-main');
    assert.match(body, /합성 예시 학교/);
    assert.doesNotMatch(body, /2판 글/);
    assert.equal((await v.goto(`${BASE}/s/dreamy-a/stories/after-rain`)).status(), 404);
    // 관리자가 동화 공개 → 방문자 그림책
    await withConsent(h, () => h.click('text=최신 판 공개'));
    await h.waitForSelector('[data-testid=entry-editor] [role=status]:has-text("공개했습니다")');
    await v.goto(`${BASE}/s/dreamy-a/stories`);
    assert.match(await v.textContent('[data-testid=site-list]'), /비 온 뒤의 약속/);
    assert.match(await v.textContent('[data-testid=site-list]'), /우정/);
    await v.goto(`${BASE}/s/dreamy-a/stories?lang=en`);
    assert.doesNotMatch(await v.textContent('[data-testid=site-list]'), /비 온 뒤의 약속/);
    assert.match(await v.textContent('[data-testid=site-list]'), /No stories are available in English yet/);
    await v.goto(`${BASE}/s/dreamy-a/stories/after-rain?lang=en`);
    assert.match(await v.textContent('.site-main'), /not available in English yet/);
    assert.equal(await v.locator('[data-testid=storybook]').count(), 0);
    await v.goto(`${BASE}/s/dreamy-a/stories/after-rain?lang=ko`);
    await v.waitForSelector('[data-testid=storybook]');
    assert.equal(await v.textContent('[data-testid=storybook-count]'), '1 / 2');
    await v.click('[data-testid=storybook] button[aria-label="다음 쪽"]');
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
    // 공개 전: 방문자에게 가져온 쪽이 없다 
    const ctxV = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const v = await ctxV.newPage();
    assert.equal((await v.goto(`${BASE}/s/dreamy-a/p/gallery`)).status(), 404);
    await withConsent(h, () => h.click('[data-testid=import-publish]'));
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
    // 그림 안 글이 있어도 선택 언어의 이야기는 그림 아래에 표시한다.
    await v.goto(`${BASE}/s/dreamy-a/stories/dawn-story`);
    await v.waitForSelector('[data-testid=storybook] .storybook-copy .storybook-text');
    assert.equal(await v.locator('.storybook-text.sr-only').count(), 0);
    // 32차: 가져온 동화는 성품 이름이 비어 있다 → 관리자가 편집 화면에서 정하면 공개 목록에 바로 보인다
    await h.goto(`${BASE}/site?box=story`);
    await h.click('.triage-item:has-text("นิทานตัวอย่าง"), .triage-item:has-text("예시 동화")');
    await h.fill('[data-testid=story-meta] label:has-text("성품 이름") input', '우정');
    await h.click('[data-testid=story-meta] button:text-is("성품 정보 저장")');
    await h.waitForSelector('[data-testid=story-meta] [role=status]:has-text("저장했습니다")');
    await v.goto(`${BASE}/s/dreamy-a/stories?lang=ko`);
    assert.match(await v.textContent('[data-testid=site-list]'), /우정/);
    // 50차: 사람이 '교육과정' 쪽 제목을 고친다(가져온 판 뒤에 사람 판)
    await h.goto(`${BASE}/site?box=page`);
    await h.click('.triage-item:has(.triage-item-sub:text-is("/curriculum"))');
    await h.waitForURL(/id=[0-9a-f-]{36}/);
    const curId = new URL(h.url()).searchParams.get('id');
    await h.evaluate(async (id) => {
      const cur = await (await fetch(`/api/site/entries/${id}`)).json();
      const content = { ...cur.content, title: { ...cur.content.title, ko: '사람이 고친 교육과정' } };
      const r = await fetch(`/api/site/entries/${id}/versions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content, note: '사람이 고침', base_version: cur.version }) });
      if (!r.ok) throw new Error('사람 판 저장 실패');
    }, curId);
    // 42차·50차: 같은 묶음을 다시 가져오면 — 고치지 않은 쪽은 새 판(옛 고정 구역 모양)으로 바꾸고, 고친 쪽은 빈 칸만, 동화는 그대로
    await h.goto(`${BASE}/site?box=settings`);
    await h.setInputFiles('[data-testid=import-file]', { name: 'export.zip', mimeType: 'application/zip', buffer: makeExportZip() });
    await h.waitForSelector('[data-testid=import-decisions]');
    assert.equal(await h.getAttribute('[data-testid=import-decisions] li:has(b:text-is("about"))', 'data-action'), 'replace');
    assert.match(await h.getAttribute('[data-testid=import-decisions] li:has(b:text-is("curriculum"))', 'data-action'), /^(merge|none)$/);
    assert.equal(await h.getAttribute('[data-testid=import-decisions] li:has(b:text-is("dawn-story"))', 'data-action'), 'keep');
    await h.click('[data-testid=import-run]');
    await h.waitForSelector('[data-testid=import-done]', { timeout: 60000 });
    assert.match(await h.textContent('[data-testid=import-kept]'), /dawn-story/);
    assert.match(await h.textContent('[data-testid=import-done]'), /시안 \d+개/);
    await withConsent(h, () => h.click('[data-testid=import-publish]'));
    await h.waitForSelector('[data-testid=import-published]', { timeout: 60000 });
    await v.goto(`${BASE}/s/dreamy-a`);
    for (const sel of ['.site-opening .rainbow-signature', '.site-opening .rainbow-arc', '.sec[data-variant=split]', '.sec[data-variant=portrait] .rainbow-arc',
      '.sec[data-variant=index] .sec-index', '.sec[data-variant=moments] .sec-label', '.site-lang-menu', '.site-footer-staff']) {
      assert.ok(await v.locator(sel).count(), `새벽빛 첫 화면에 ${sel}`);
    }
    // 언어 목록은 언어를 고르거나, 다른 곳을 누르거나, Esc를 누르면 저절로 닫힌다
    const langOpen = () => v.evaluate(() => document.querySelector('.site-lang-menu')?.hasAttribute('open'));
    await v.click('.site-lang-menu summary');
    assert.equal(await langOpen(), true);
    await v.click('.site-lang-menu nav a[hreflang=en]');
    await v.waitForURL(/lang=en/);
    await v.waitForFunction(() => !document.querySelector('.site-lang-menu')?.hasAttribute('open'));
    await v.click('.site-lang-menu summary');
    assert.equal(await langOpen(), true);
    await v.mouse.click(5, 600);
    assert.equal(await langOpen(), false);
    await v.click('.site-lang-menu summary');
    await v.keyboard.press('Escape');
    assert.equal(await langOpen(), false);
    // 118차: 안내 띠의 그림은 장식(대체 글 없음·읽기 도구에서 숨김) — 사진 자리가 아니다
    await h.evaluate(async () => {
      const list = await (await fetch('/api/site/entries')).json();
      const home = (Array.isArray(list) ? list : list.entries).find((e) => e.kind === 'page' && e.key === 'home');
      const cur = await (await fetch(`/api/site/entries/${home.id}`)).json();
      const assets = await (await fetch('/api/site/assets')).json();
      const decor = (Array.isArray(assets) ? assets : assets.assets).find((a) => a.mime.startsWith('image/')).id;
      const blocks = cur.content.blocks.map((b) => (b.type === 'section' && b.template === 'cta' ? { ...b, asset: decor } : b));
      const send = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      await send(`/api/site/entries/${home.id}/versions`, { content: { ...cur.content, blocks }, note: '장식 그림', base_version: cur.version });
      await send(`/api/site/entries/${home.id}/publish`, { photo_consent: true });
    });
    await v.goto(`${BASE}/s/dreamy-a`);
    assert.ok(await v.locator('.sec[data-template=cta][data-decor] .sec-decor[aria-hidden=true] img[alt=""]').count(), '안내 띠 장식 그림');
    // 사람이 고친 교육과정 제목은 다시 가져오기 뒤에도 그대로
    const curAfter = await h.evaluate(async (id) => (await (await fetch(`/api/site/entries/${id}`)).json()).content.title.ko, curId);
    assert.equal(curAfter, '사람이 고친 교육과정');
    await v.goto(`${BASE}/s/dreamy-a/p/about`);
    assert.match(await v.textContent('.site-crumb'), /หน้าแรก/);
    assert.ok(await v.locator('.sec[data-variant=overview] .sec-facts').count());
    await v.goto(`${BASE}/s/dreamy-a/stories?lang=ko`);
    assert.match(await v.textContent('[data-testid=site-list]'), /우정/); // 동화 성품 이름이 다시 가져오기로 지워지지 않았다
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
    // 46차 AI 연결(ADR 0022): AI 종류를 고르면 지시문 + 토큰 한 덩어리 → 한 번에 복사
    await h.check('[data-testid=agent-connect-ai] label:has-text("Claude Code") input');
    const connect = await h.inputValue('[data-testid=agent-connect-text]');
    assert.equal(connect.split(token).length - 1, 1); // 토큰은 정확히 한 번
    assert.match(connect, /드리미 예시학교/);
    assert.match(connect, /after-rain → .*\/s\/dreamy-a\/stories\/after-rain/);
    assert.match(connect, /Claude Code 클라우드/);
    assert.match(connect, /base_version/);
    // 83차: 세션마다 발급 안내가 보이고, 작업자·세션 이름을 넣으면 연결 글에 들어간다(사용 기록에 남김)
    await h.locator('[data-testid=agent-token-session-guide]').waitFor();
    assert.match(connect, /x-agent-session/);
    await h.fill('[data-testid=agent-connect-operator]', '예시 교사');
    await h.fill('[data-testid=agent-connect-session]', '동화-수정-1');
    const connect2 = await h.inputValue('[data-testid=agent-connect-text]');
    assert.match(connect2, /SCHOOL_AGENT_OPERATOR='예시 교사'/);
    assert.match(connect2, /SCHOOL_AGENT_SESSION='동화-수정-1'/);
    await h.fill('[data-testid=agent-connect-operator]', '');
    await h.fill('[data-testid=agent-connect-session]', '');
    await ctxH.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    await h.click('[data-testid=agent-connect-copy]');
    await h.waitForSelector('[data-testid=agent-connect] [role=status]:has-text("연결 글을 복사했습니다")');
    assert.equal(await h.evaluate(() => navigator.clipboard.readText()), connect);
    // 이미 발급한 토큰: 지시문만(원문 없음)
    await h.click('[data-testid=agent-token-list] tr:has-text("/after-rain") [data-testid=agent-instruction-copy]');
    await h.waitForSelector('[data-testid=agent-token-list] [role=status]:has-text("복사했습니다")');
    const only = await h.evaluate(() => navigator.clipboard.readText());
    assert.doesNotMatch(only, /agt_/);
    assert.match(only, /환경 변수 SCHOOL_AGENT_TOKEN 에 있다/);
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
    await withConsent(h, () => h.click('text=최신 판 공개'));
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

  await step('확인 대화상자: 처음 포커스는 취소, Esc로 닫으면 그대로, 확인하면 실행(자료 빼기·청구 확정)', async () => {
    await b.goto(`${BASE}/intake`);
    const before = await sourceItems(b).count();
    const item = sourceItems(b).filter({ hasText: 'b-calendar-2027.pdf' });
    await item.locator('button:text-is("목록에서 빼기")').click();
    const dlg = b.locator('[role=alertdialog][data-testid=confirm-dialog]');
    await dlg.waitFor();
    assert.match(await dlg.textContent(), /자료를 목록에서 뺄까요\?.*b-calendar-2027\.pdf.*발행한 문서의 근거로 그대로 보관/s);
    const focusedName = () => b.evaluate(() => { const e = document.activeElement; return e === document.body ? '(body)' : (e?.textContent ?? '').slice(0, 40); });
    // 95차: 학교 기본 언어가 화면 언어가 된다(B = 영어 학교). 다국어로 옮긴 부품(취소)은 그 언어로 나온다
    const cancelLabel = (await b.locator('.app').getAttribute('lang')) === 'en' ? 'Cancel' : '취소';
    await b.waitForFunction((l) => document.activeElement?.textContent === l, cancelLabel, { timeout: 3000 }).catch(() => {});
    assert.equal(await focusedName(), cancelLabel, '처음 포커스');
    await shot(b, '31-confirm-dialog.png');
    // 대화상자는 화면 형식·명암 토큰을 가진 .app 안에 그린다(#135, 어두운 화면에서도 같은 토큰)
    assert.ok(await dlg.evaluate((el) => !!el.closest('.app[data-mode]')), '대화상자가 .app 안에 있다');
    // Tab은 대화상자 안에서만 돈다(포커스 가둠)
    await b.keyboard.press('Tab');
    await b.keyboard.press('Tab');
    assert.ok(await b.evaluate(() => !!document.activeElement?.closest('[role=alertdialog]')));
    await b.keyboard.press('Escape');
    await dlg.waitFor({ state: 'detached' });
    assert.equal(await sourceItems(b).count(), before);
    await b.waitForFunction(() => document.activeElement?.textContent === '목록에서 빼기', null, { timeout: 3000 }).catch(() => {});
    assert.equal(await focusedName(), '목록에서 빼기', '닫은 뒤 포커스');
    await item.locator('button:text-is("목록에서 빼기")').click();
    await dlg.locator('button:text-is("목록에서 빼기")').click();
    await b.waitForFunction((n) => document.querySelectorAll('[data-testid=source-list] li').length === n - 1, before);

    // 전체 관리자: 청구 확정은 확인 뒤에만 기록이 생긴다
    const ctxC = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const p = await ctxC.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill('input[name=email]', 'platform@example.test');
    await p.fill('input[name=password]', 'demo-pass-p');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/admin$/);
    const row = p.locator('[data-testid=school-table] tr', { hasText: 'Rungarun Example School' });
    const billsBefore = await p.locator('[data-testid=bill-table] tbody tr').count();
    await row.locator('button:has-text("청구 확정")').click();
    const pd = p.locator('[role=alertdialog]');
    await pd.waitFor();
    assert.match(await pd.textContent(), /고치거나 지울 수 없습니다/);
    await pd.locator('button:text-is("취소")').click();
    await pd.waitFor({ state: 'detached' });
    assert.equal(await p.locator('[data-testid=bill-table] tbody tr').count(), billsBefore);
    await row.locator('button:has-text("청구 확정")').click();
    await pd.locator('button:text-is("청구 확정")').click();
    await p.waitForFunction((n) => document.querySelectorAll('[data-testid=bill-table] tbody tr').length === n + 1, billsBefore);
    assert.match(await p.textContent('[data-testid=bill-table]'), /Rungarun Example School/);
    await ctxC.close();
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
    // 목록 카드에서 편집기를 열지 않고 공개 → 방문자
    await h.goto(`${BASE}/site?box=story`);
    const moonCard = h.locator('.site-entry-card:has(.triage-item-title:text-is("달빛 약속"))');
    assert.equal(await h.locator('[data-testid=entry-editor]').count(), 0);
    await withConsent(h, () => moonCard.locator('button:text-is("공개하기")').click());
    await moonCard.locator('.badge:text-is("공개 중")').waitFor();
    assert.equal(await h.locator('[data-testid=entry-editor]').count(), 0);
    assert.equal(new URL(h.url()).searchParams.has('id'), false);
    const ctxV = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const v = await ctxV.newPage();
    await v.goto(`${BASE}/s/dreamy-a/stories/moon-promise?lang=ko`);
    await v.waitForSelector('[data-testid=storybook]');
    assert.match(await v.textContent('.storybook-text'), /둘째 쪽/); // 구조 바꾸기(순서)가 반영
    assert.match(await v.textContent('.site-main'), /이야기를 마치며/);
    // 공개 중에는 에이전트가 보관 못 함 → 관리자가 내린 뒤 보관
    assert.equal((await call('/api/agent/entries/story/moon-promise/archive', 'POST')).status, 409);
    await moonCard.locator('button:text-is("공개 해제")').click();
    await moonCard.locator('.badge:text-is("공개 내림")').waitFor();
    assert.equal(await h.locator('[data-testid=entry-editor]').count(), 0);
    assert.equal((await v.goto(`${BASE}/s/dreamy-a/stories/moon-promise`)).status(), 404);
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

  await step('40차: 공개 권한 — 에이전트에게 공개를 지시하면 사이트에서 누르지 않아도 바로 공개, 만들기만으로는 공개 안 됨, 공개 내림', async () => {
    const ctxH = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const h = await ctxH.newPage();
    await login(h, 'admin-a@school-a.test', 'demo-pass-a');
    await h.goto(`${BASE}/site?box=settings`);
    await h.check('[data-testid=agent-token-perms] label:has-text("만들기") input');
    await h.check('[data-testid=agent-token-perms] label:has-text("공개") input');
    await h.waitForSelector('[data-testid=agent-token-publish-note]');
    await h.click('[data-testid=agent-token-issue]');
    const token = (await h.textContent('[data-testid=agent-token-value]')).trim();
    const call = async (p, body) => (await fetch(`${BASE}${p}`, { method: body ? 'POST' : 'GET', headers: { 'x-agent-token': token, 'content-type': 'application/json' }, body: body && JSON.stringify(body) })).status;
    assert.equal(await call('/api/agent/entries/story', { key: 'star-promise', content: { title: { ko: '별빛 약속' }, blocks: [{ type: 'story_page', text: { ko: '별이 빛나요.' } }] } }), 200);
    assert.equal((await fetch(`${BASE}/s/dreamy-a/stories/star-promise`)).status, 404); // 만들기만으로는 공개 안 됨
    assert.equal(await call('/api/agent/entries/story/star-promise/publish', {}), 200);
    const v = await (await browser.newContext()).newPage();
    await v.goto(`${BASE}/s/dreamy-a/stories/star-promise?lang=ko`);
    await v.waitForSelector('[data-testid=storybook]');
    assert.match(await v.textContent('.storybook-text'), /별이 빛나요/);
    // 관리 화면에도 공개 중으로, 활동 기록에 '공개'
    await h.goto(`${BASE}/site?box=settings`);
    assert.match(await h.textContent('[data-testid=agent-token-list]'), /star-promise 1판 공개/);
    assert.equal(await call('/api/agent/entries/story/star-promise/unpublish', {}), 200);
    assert.equal((await v.goto(`${BASE}/s/dreamy-a/stories/star-promise`)).status(), 404);
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
    // 관제 D-4: 사진을 올리는 곳에는 공개 허가 안내 한 줄(학교 관리자 책임)
    assert.match(await h.textContent('[data-testid=le-picker] [data-testid=photo-consent]'), /공개 허가/);
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000002000000020806000000f478d4fa0000001549444154789c63f8cfc0f01f0418181818fe03000c1a02fe3e5a6c4d0000000049454e44ae426082', 'hex');
    const up = h.waitForResponse((r) => r.url().endsWith('/api/site/assets') && r.request().method() === 'POST');
    await h.setInputFiles('[data-testid=le-picker] input[type=file]', { name: 'synthetic.png', mimeType: 'image/png', buffer: png });
    const asset = await (await up).json();
    await h.waitForSelector(`[data-testid=le-picker] .le-assets button[aria-pressed=true] img[src="/site/assets/${asset.id}"]`);
    await h.click('[data-testid=le-picker] button:text-is("다 했어요")');
    await h.waitForSelector('[data-testid=le-picker]', { state: 'detached' });
    // 쪽 머리의 표지 사진 단추도 한 번 누르면 열린다(누르는 순간 빈 칸이 펼쳐져 단추가 밀리면 안 됨 — 운영에서 찾은 문제)
    if (!(await h.locator('[data-testid=le-guide]').count())) await h.click('[data-testid=le-guide-toggle]');
    await h.selectOption('[data-testid=le-guide] select', 'opening');
    await h.locator('.site-head .le-photo-btn').click();
    await h.waitForSelector('[data-testid=le-picker][open]');
    await h.click('[data-testid=le-picker] button[aria-label="사진함 닫기"]');
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
    // 122차: 공개 창 — 올린 사진이 목록에 보이고, 허가를 체크해야 공개 단추가 켜진다
    const asked = h.waitForResponse((r) => r.url().endsWith('/api/site/photos'));
    await h.click('[data-testid=le-publish]');
    assert.ok((await (await asked).json()).photos.some((ph) => ph.id === asset.id));
    await h.waitForSelector(`[data-testid=photo-consent-dialog] img[src="/site/assets/${asset.id}"]`);
    assert.equal(await h.isDisabled('[data-testid=photo-consent-confirm]'), true);
    await shot(h, '122-publish-consent.png');
    await h.check('[data-testid=photo-consent-check]');
    await h.click('[data-testid=photo-consent-confirm]');
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


  await step('48차: 공개 화면의 교직원 로그인 → 로그인 → 그 쪽 화면 편집 → 공개 화면으로', async () => {
    const ctxS = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const v = await ctxS.newPage();
    await v.goto(`${BASE}/s/dreamy-a/p/about`);
    await v.click('[data-testid=staff-edit]');
    await v.waitForURL(/\/login\?next=/);
    await v.waitForSelector('[data-testid=login-edit-note]');
    await v.fill('input[name=email]', 'admin-a@school-a.test');
    await v.fill('input[name=password]', 'demo-pass-a');
    await v.click('button[type=submit]');
    await v.waitForURL(/\/site\/edit\/[0-9a-f-]{36}\?back=/);
    await v.waitForSelector('[data-testid=live-editor]');
    await v.click('[data-testid=live-edit-back]');
    await v.waitForURL(/\/s\/dreamy-a\/p\/about$/);
    // 이미 로그인했으면 바로 편집으로
    await v.click('[data-testid=staff-edit]');
    await v.waitForURL(/\/site\/edit\/[0-9a-f-]{36}\?back=/);
    await ctxS.close();
    // 다른 학교 관리자는 이 학교 편집으로 들어가지 못한다
    const ctxB = await browser.newContext();
    const b = await ctxB.newPage();
    await login(b, 'admin-b@school-b.test', 'demo-pass-b');
    await b.goto(`${BASE}/site/open?slug=dreamy-a&kind=page&key=about`);
    assert.doesNotMatch(b.url(), /\/site\/edit\//);
    await ctxB.close();
  });

  await step('53차: 관리 화면 안에서 화면 편집 — 줄마다 화면 단추 · 고치는 방식 전환 · 화면 편집 안 쪽 고르기', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const h = await ctx.newPage();
    await login(h, 'admin-a@school-a.test', 'demo-pass-a');
    await h.goto(`${BASE}/site?box=page`);
    // 줄의 '화면' 단추 → 그 쪽 화면 편집
    await h.click('.site-entry-card:has(.triage-item-sub:text-is("/curriculum")) [data-testid=row-live-edit]');
    await h.waitForURL(/\/site\/edit\/[0-9a-f-]{36}$/);
    await h.waitForSelector('[data-testid=live-editor] .site h1 .le-text');
    // 화면 편집 안에서 다른 쪽으로 바로
    const aboutId = await h.locator('[data-testid=le-switch] option', { hasText: '/about' }).first().getAttribute('value');
    await h.selectOption('[data-testid=le-switch]', aboutId);
    await h.waitForURL(new RegExp(`/site/edit/${aboutId}$`));
    assert.equal(await h.inputValue('[data-testid=le-switch]'), aboutId);
    // 목록 · 항목별로 고치기 → 편집 칸 위 전환에서 다시 화면으로
    await h.click('[data-testid=le-to-form]');
    await h.waitForSelector('[data-testid=view-switch] [aria-current=page]:has-text("항목별로 고치기")');
    await h.click('[data-testid=view-switch] [data-testid=live-edit-link]');
    await h.waitForURL(new RegExp(`/site/edit/${aboutId}$`));
    await ctx.close();
  });

  await step('49차: 공개 화면 관리 막대(관리자에게만) · 소식 쓰기 · 개선 요청 · 편집 화면 바로가기', async () => {
    const anon = await (await browser.newContext()).newPage();
    await anon.goto(`${BASE}/s/dreamy-a/p/about`);
    assert.equal(await anon.locator('[data-testid=site-admin-bar]').count(), 0);
    await anon.context().close();
    const ctxB = await browser.newContext();
    const b = await ctxB.newPage();
    await login(b, 'admin-b@school-b.test', 'demo-pass-b');
    await b.goto(`${BASE}/s/dreamy-a/p/about`);
    assert.equal(await b.locator('[data-testid=site-admin-bar]').count(), 0); // 다른 학교 관리자에게는 없음
    await ctxB.close();
    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const a = await ctxA.newPage();
    await login(a, 'admin-a@school-a.test', 'demo-pass-a');
    await a.goto(`${BASE}/s/dreamy-a/p/about`);
    const bar = a.locator('[data-testid=site-admin-bar]');
    await bar.waitFor();
    await bar.locator('a:text-is("소식 쓰기")').click();
    await a.waitForURL(/\/site\?box=news&new=1$/);
    await a.waitForSelector('.site-new.site-form');
    await a.goto(`${BASE}/s/dreamy-a/p/about`);
    await a.locator('[data-testid=site-admin-bar] a:text-is("개선 요청")').click();
    await a.waitForSelector('[data-testid=chatdock]');
    await a.goto(`${BASE}/s/dreamy-a/p/about`);
    await a.locator('[data-testid=site-admin-bar] a:text-is("이 화면 편집")').click();
    await a.waitForSelector('[data-testid=live-editor]');
    await a.click('[data-testid=live-edit-chat]');
    await a.waitForSelector('[data-testid=chatdock]');
    assert.equal(await a.locator('[data-testid=live-edit-news]').count(), 1);
    await ctxA.close();
  });

  await step('115차: 교사도 공개 화면에서 바로 편집 — 관리 막대(교직원) → 이 화면 편집 → 시안 저장만(공개 단추 없음)', async () => {
    // 합성 교사 계정 (A 학교 구성원, 역할 teacher)
    const db = new pg.Client({ connectionString: DB_URL });
    await db.connect();
    const salt = crypto.randomBytes(16);
    const hash = `scrypt$16384$${salt.toString('base64')}$${crypto.scryptSync('demo-pass-t', salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64')}`;
    const { rows: [u] } = await db.query(`insert into private.app_users(email, password_hash, display_name) values ('e2e-teacher@school-a.test', $1, 'E2E 교사') returning id`, [hash]);
    await db.query(`insert into public.memberships(school_id, user_id, role) select id, $1, 'teacher' from public.schools where slug = 'school-a'`, [u.id]);
    await db.end();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const t = await ctx.newPage();
    // 로그인 전: 바닥의 교직원 로그인 → 로그인 → 그 쪽 화면 편집
    await t.goto(`${BASE}/s/dreamy-a/p/about`);
    assert.equal(await t.locator('[data-testid=site-admin-bar]').count(), 0);
    await t.click('[data-testid=staff-edit]');
    await t.waitForURL(/\/login\?next=/);
    await t.fill('input[name=email]', 'e2e-teacher@school-a.test');
    await t.fill('input[name=password]', 'demo-pass-t');
    await t.click('button[type=submit]');
    await t.waitForURL(/\/site\/edit\/[0-9a-f-]{36}\?back=/);
    await t.waitForSelector('[data-testid=live-editor] .site h1 .le-text');
    assert.equal(await t.locator('[data-testid=le-save]').count(), 1);
    assert.equal(await t.locator('[data-testid=le-publish]').count(), 0); // 공개는 관리자
    // 로그인한 뒤: 공개 화면 위 관리 막대(교직원) → 이 화면 편집
    await t.goto(`${BASE}/s/dreamy-a/p/about`);
    const bar = t.locator('[data-testid=site-admin-bar]');
    await bar.waitFor();
    assert.equal(await bar.getAttribute('data-role'), 'staff');
    await bar.locator('a[href*="kind=page"]').click();
    await t.waitForURL(/\/site\/edit\/[0-9a-f-]{36}\?back=/);
    await t.waitForSelector('[data-testid=live-editor]');
    await shot(t, '115-teacher-live-edit.png');
    await ctx.close();
  });

  await step('성품 동화 새 판 일괄 공개: 선택·충돌·공개 내림 제외·태국어 노출', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const h = await ctx.newPage();
    await login(h, 'admin-a@school-a.test', 'demo-pass-a');
    const post = async (url, body) => {
      const response = await ctx.request.post(`${BASE}${url}`, { data: body });
      assert.equal(response.status(), 200); return response.json();
    };
    const content = (title) => ({ title: { ko: title, th: `นิทานตัวอย่าง: ${title}` }, blocks: [{ type: 'story_page', text: { ko: '합성 예시 본문', th: 'เรื่องราวตัวอย่าง' } }] });
    const first = await post('/api/site/entries', { kind: 'story', key: 'bulk-first', content: content('일괄 첫 동화') });
    const stale = await post('/api/site/entries', { kind: 'story', key: 'bulk-stale', content: content('일괄 바뀐 동화') });
    const hidden = await post('/api/site/entries', { kind: 'story', key: 'bulk-hidden', content: content('일괄 내린 동화') });
    await post(`/api/site/entries/${hidden.id}/publish`, { photo_consent: true });
    await post(`/api/site/entries/${hidden.id}/publish`, { versionId: null });
    await h.goto(`${BASE}/site?box=story`);
    const control = h.locator('[data-testid=bulk-publish-control]');
    await control.getByRole('button', { name: /새 판 일괄 공개/ }).click();
    await control.getByLabel(/전체 선택/).uncheck();
    assert.equal(await control.getByLabel(/일괄 내린 동화/).count(), 0);
    await control.getByLabel(/일괄 첫 동화/).check();
    await control.getByLabel(/일괄 바뀐 동화/).check();
    // 선택을 확인하는 동안 다른 작업자가 새 판을 저장한다.
    await post(`/api/site/entries/${stale.id}/versions`, { content: content('일괄 바뀐 동화 2'), base_version: 1 });
    await withConsent(h, () => control.getByRole('button', { name: '선택한 2편 공개', exact: true }).click());
    await control.getByRole('status').getByText('공개 1편 · 이미 최신 판 공개 0편 · 확인 필요 1편', { exact: true }).waitFor();
    await control.getByText(/일괄 바뀐 동화: 그 사이 새 판/).waitFor();
    await shot(h, 'bulk-publish-result.png');
    const visitor = await browser.newContext();
    const v = await visitor.newPage();
    await v.goto(`${BASE}/s/dreamy-a/stories/bulk-first?lang=th`);
    assert.match(await v.textContent('.site-main'), /นิทานตัวอย่าง/);
    assert.equal((await v.goto(`${BASE}/s/dreamy-a/stories/bulk-stale`)).status(), 404);
    assert.equal((await visitor.request.post(`${BASE}/api/site/entries/bulk-publish`, { data: { items: [{ id: first.id, base_version: 1, live_version: null }] } })).status(), 401);
    // 별도 번역 그림은 이미 등록된 합성 파일만 연결한다. 생성 서비스는 호출하지 않는다.
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
    const uploaded = await ctx.request.post(`${BASE}/api/site/assets`, { multipart: { file: { name: 'language-test.png', mimeType: 'image/png', buffer: png } } });
    assert.equal(uploaded.status(), 200);
    const art = (await uploaded.json()).id;
    const localized = { title: { ko: '그림 아래 줄거리', en: 'Summary under the picture', th: 'เรื่องย่อใต้ภาพ' }, blocks: [
      { type: 'image', asset: art, images: { th: { asset: art } } },
      { type: 'section', template: 'steps', title: { ko: '이야기 흐름', en: 'Story outline', th: 'โครงเรื่อง' }, items: [
        { title: { ko: '시작', en: 'Beginning', th: 'เริ่มเรื่อง' }, body: { ko: '친구의 말을 들어요.', en: 'Listen to a friend.', th: 'ฟังสิ่งที่เพื่อนพูด' } },
      ] },
      { type: 'story_page', asset: art, images: { en: { asset: art } }, text: { ko: '장면의 이야기', en: 'The scene story', th: 'เรื่องราวในฉาก' } },
    ] };
    const book = await post('/api/site/entries', { kind: 'story', key: 'language-images', text_in_image: true, content: localized });
    await post(`/api/site/entries/${book.id}/publish`, { photo_consent: true });
    for (const [lang, text] of [['th', 'ฟังสิ่งที่เพื่อนพูด'], ['en', 'Listen to a friend.'], ['ko', '친구의 말을 들어요.']]) {
      await v.goto(`${BASE}/s/dreamy-a/stories/language-images?lang=${lang}`);
      assert.ok(await v.getByTestId('story-synopsis').isVisible());
      assert.ok((await v.getByTestId('story-synopsis').innerText()).includes(text));
      assert.ok(await v.locator('.storybook-text').isVisible());
      assert.equal(await v.locator('.site-figure img').getAttribute('src'), `/s/dreamy-a/a/${art}`);
    }
    await h.goto(`${BASE}/site?box=story&id=${book.id}`);
    await h.locator('.site-language-images').first().locator('summary').click();
    assert.ok(await h.getByRole('combobox', { name: /ไทย 그림/ }).first().isVisible());
    await visitor.close(); await ctx.close();
  });
  await step('61차 F5: 학사 꾸러미 — 관리자 발급(학사 꾸러미) → 학교 AI가 정의·꾸러미 저장 → 검사·미리보기 → 관리자가 /packages 에서 켜기', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    const h = await ctx.newPage();
    await login(h, 'admin-a@school-a.test', 'demo-pass-a');
    await h.goto(`${BASE}/site?box=settings`);
    for (const k of ['성품 동화', '쪽', '소식']) {
      const box = h.locator(`[data-testid=agent-token-kinds] label:text-is("${k}") input`);
      if (await box.count() && await box.isChecked()) await box.uncheck();
    }
    await h.check('[data-testid=agent-token-kinds] label:has-text("학사 꾸러미") input');
    for (const perm of ['만들기', '고치기']) {
      const box = h.locator(`[data-testid=agent-token-perms] label:has-text("${perm}") input`).first();
      if (await box.count() && !(await box.isChecked())) await box.check();
    }
    await h.click('[data-testid=agent-token-issue]');
    const token = (await h.textContent('[data-testid=agent-token-value]')).trim();
    assert.match(await h.inputValue('[data-testid=agent-connect-text]'), /POST \/api\/agent\/definitions/);
    const call = async (p, body) => {
      const r = await fetch(`${BASE}${p}`, { method: body ? 'POST' : 'GET', headers: { 'x-agent-token': token, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
      return { status: r.status, json: await r.json() };
    };
    const bad = await call('/api/agent/definitions', { kind: 'record_type', code: 'e2e_service', base_version: 0, spec: { title: { ko: '봉사' }, subject: 'person',
      fields: [{ key: 'student_name', type: 'text', label: { ko: '이름' }, privacy: 'internal' }] } });
    assert.equal(bad.status, 200);
    assert.equal(bad.json.valid, false);
    const ok = await call('/api/agent/definitions', { kind: 'record_type', code: 'e2e_service', base_version: 1, spec: { title: { ko: 'E2E 봉사 시간' }, subject: 'person',
      fields: [{ key: 'activity', type: 'text', label: { ko: '활동' }, privacy: 'internal', required: true }, { key: 'hours', type: 'hours', label: { ko: '시간' }, privacy: 'internal' }] } });
    assert.equal(ok.json.valid, true);
    assert.equal((await call('/api/agent/definitions', { kind: 'view', code: 'e2e_list', base_version: 0, spec: { record_type: 'e2e_service', columns: ['person', 'activity', 'hours'] } })).json.valid, true);
    const pack = await call('/api/agent/packages', { code: 'e2e_pack', title: { ko: 'E2E 봉사 꾸러미' }, base_version: 0, members: [{ kind: 'record_type', code: 'e2e_service' }, { kind: 'view', code: 'e2e_list' }] });
    assert.equal(pack.json.valid, true);
    assert.equal((await call('/api/agent/definitions', { kind: 'view', code: 'e2e_list', base_version: 0, spec: {} })).status, 409);
    const pv = await call('/api/agent/packages/e2e_pack/preview');
    assert.deepEqual(pv.json.preview[0].list.rows[0], ['예시 학생 1', '활동 예시 1', '2']);
    assert.equal((await fetch(`${BASE}/api/agent/packages/e2e_pack/state`, { method: 'POST', headers: { 'x-agent-token': token } })).status, 404); // 켜기 경로는 토큰에 없다
    await h.goto(`${BASE}/packages`);
    await h.click('[data-testid=pkg-e2e_pack] details summary');
    await shot(h, '61-packages.png');
    await h.click('[data-testid=pkg-on-e2e_pack]');
    await h.waitForSelector('[data-testid=pkg-off-e2e_pack]');
    assert.match(await h.textContent('[data-testid=pkg-e2e_pack]'), /켜짐 · 1판/);
    await ctx.close();
  });
  await step('62차 F6: 학생 열람 계정 — 관리자가 설정에서 만들기 → 학생 로그인은 /my(내 기록)로, 교직원 화면은 못 봄 → 관리자가 끝내기', async () => {
    // 합성 학생 1명과 그 학생의 로그인 계정(비밀번호 로그인은 시험용 시드 방식과 같다)
    const db = new pg.Client({ connectionString: DB_URL });
    await db.connect();
    const { rows: [sch] } = await db.query(`select id from public.schools where slug = 'school-a'`);
    const { rows: [person] } = await db.query(`insert into public.people(school_id, created_by) select $1, id from private.app_users where email = 'admin-a@school-a.test' returning id`, [sch.id]);
    await db.query(`insert into public.person_names(school_id, person_id, version, name, recorded_by) select $1, $2, 1, 'E2E 열람 학생', id from private.app_users where email = 'admin-a@school-a.test'`, [sch.id, person.id]);
    const salt = crypto.randomBytes(16);
    const hash = `scrypt$16384$${salt.toString('base64')}$${crypto.scryptSync('demo-pass-s', salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64')}`;
    await db.query(`insert into private.app_users(email, password_hash, display_name) values ('e2e-student@family.test', $1, 'E2E 학생')`, [hash]);
    await db.end();

    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const a = await ctxA.newPage();
    await login(a, 'admin-a@school-a.test', 'demo-pass-a');
    await a.goto(`${BASE}/settings`);
    const form = a.locator('[data-testid=portal-account-form]');
    await form.locator('.field select').first().selectOption({ label: 'E2E 열람 학생' });
    await form.locator('input[type=email]').fill('e2e-student@family.test');
    await form.locator('label:has-text("동의 연령 미만") input').check();
    await form.locator('button[type=submit]').click();
    await a.locator('[data-testid=portal-account-list] li', { hasText: 'E2E 열람 학생' }).waitFor();
    assert.match(await a.textContent('[data-testid=portal-account-list]'), /연결됨 · 동의 근거 보호자 동의/);

    const ctxS = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const s = await ctxS.newPage();
    await s.goto(`${BASE}/login`);
    await s.fill('input[name=email]', 'e2e-student@family.test');
    await s.fill('input[name=password]', 'demo-pass-s');
    await s.click('button[type=submit]');
    await s.waitForURL(/\/my$/);
    assert.match(await s.textContent('h1'), /E2E 열람 학생/);
    await s.locator('[data-testid=my-records]').waitFor();
    await shot(s, '62-my-record.png');
    await s.goto(`${BASE}/settings`);
    await s.waitForURL(/\/my$/); // 교직원 화면은 열람 계정에게 열리지 않는다
    const api = await ctxS.request.get(`${BASE}/api/settings/members`);
    assert.ok(api.status() >= 400);

    await a.locator('[data-testid=portal-account-list] li', { hasText: 'E2E 열람 학생' }).locator('button:text-is("끝내기")').click();
    await a.locator('[role=status]', { hasText: '열람 계정을 끝냈습니다' }).waitFor();
    await s.goto(`${BASE}/my`);
    await s.locator('h1:has-text("볼 수 있는 기록이 없습니다")').waitFor();
    await ctxA.close(); await ctxS.close();
  });
  await step('63차 F6: 수정 요청 → 관리자 거부(이유) → 학생 이의 의견서 → 관리자 화면에 보임, 보존 규칙·파기 미리보기(재학 중이면 불가)', async () => {
    const db = new pg.Client({ connectionString: DB_URL });
    await db.connect();
    const { rows: [sch] } = await db.query(`select id from public.schools where slug = 'school-a'`);
    const { rows: [person] } = await db.query(`insert into public.people(school_id, created_by) select $1, id from private.app_users where email = 'admin-a@school-a.test' returning id`, [sch.id]);
    await db.query(`insert into public.person_names(school_id, person_id, version, name, recorded_by) select $1, $2, 1, 'E2E 요청 학생', id from private.app_users where email = 'admin-a@school-a.test'`, [sch.id, person.id]);
    const salt = crypto.randomBytes(16);
    const hash = `scrypt$16384$${salt.toString('base64')}$${crypto.scryptSync('demo-pass-r', salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64')}`;
    await db.query(`insert into private.app_users(email, password_hash, display_name) values ('e2e-request@family.test', $1, 'E2E 요청')`, [hash]);
    await db.end();

    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const a = await ctxA.newPage();
    await login(a, 'admin-a@school-a.test', 'demo-pass-a');
    await a.goto(`${BASE}/settings`);
    const form = a.locator('[data-testid=portal-account-form]');
    await form.locator('.field select').first().selectOption({ label: 'E2E 요청 학생' });
    await form.locator('input[type=email]').fill('e2e-request@family.test');
    await form.locator('button[type=submit]').click();
    await a.locator('[data-testid=portal-account-list] li', { hasText: 'E2E 요청 학생' }).waitFor();

    const ctxS = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const s = await ctxS.newPage();
    await s.goto(`${BASE}/login`);
    await s.fill('input[name=email]', 'e2e-request@family.test');
    await s.fill('input[name=password]', 'demo-pass-r');
    await s.click('button[type=submit]');
    await s.waitForURL(/\/my$/);
    const rf = s.locator('[data-testid=my-request-form]');
    await rf.locator('textarea').fill('E2E 행동 특성 서술이 사실과 다릅니다.');
    await rf.locator('button[type=submit]').click();
    await s.locator('[data-testid=my-requests] li', { hasText: 'E2E 행동 특성 서술' }).waitFor();
    assert.match(await s.textContent('[data-testid=my-requests]'), /접수/);

    await a.goto(`${BASE}/requests`);
    const item = a.locator('[data-testid=request-list] li', { hasText: 'E2E 행동 특성 서술' });
    await item.locator('select[aria-label="결정"]').selectOption('denied');
    await item.locator('input[aria-label="이유"]').fill('E2E 담임 확인 결과 기록이 정확합니다.');
    await item.locator('button:text-is("결정")').click();
    await a.locator('[data-testid=request-list] li', { hasText: 'E2E 담임 확인 결과' }).waitFor();

    await s.goto(`${BASE}/my`);
    const mine = s.locator('[data-testid=my-requests] li', { hasText: 'E2E 행동 특성 서술' });
    await mine.locator('textarea').fill('E2E 저는 그 기간 봉사 활동 중이었습니다.');
    await mine.locator('button:text-is("의견서 붙이기")').click();
    await s.locator('[data-testid=my-requests]', { hasText: '내 의견서: E2E 저는 그 기간' }).waitFor();
    await shot(s, '63-my-requests.png');

    await a.goto(`${BASE}/requests`);
    assert.match(await a.textContent('[data-testid=request-list]'), /이의 의견서: E2E 저는 그 기간/);
    await a.locator('[data-testid=retention-form] input[type=number]').fill('5');
    await a.locator('[data-testid=retention-form] button[type=submit]').click();
    await a.locator('p.fine', { hasText: '1판 · 재적이 끝난 뒤 5년' }).waitFor();
    await a.locator('[data-testid=redact-panel] select').selectOption({ label: 'E2E 요청 학생' });
    await a.locator('[data-testid=redact-panel] p', { hasText: '파기할 수 없습니다' }).waitFor();
    await shot(a, '63-requests.png');
    await ctxA.close(); await ctxS.close();
  });
  await step('65차: 홈페이지 템플릿 — 둘러보기 7종 → 이야기형 미리보기(쪽 이동) → 적용하면 없는 쪽만 시안 → 쪽 목록에 보임(공개 안 됨)', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const h = await ctx.newPage();
    await login(h, 'admin-a@school-a.test', 'demo-pass-a');
    await h.goto(`${BASE}/site`);
    await h.click('[data-testid=site-templates-link]');
    await h.waitForURL(/\/site\/templates$/);
    assert.equal(await h.locator('[data-testid=template-grid] article').count(), 12);
    assert.equal(await h.locator('[data-testid=template-grid] article .template-thumb img').count(), 12);
    assert.equal((await h.request.get(`${BASE}/site-templates/story.jpg`)).status(), 200);
    // 138차 후속: 거르기는 쪽을 다시 부르지 않고 화면 안에서 바로 걸러진다(화면 상태 유지, 주소는 바뀜)
    await h.evaluate(() => { window.__noReload = true; });
    await h.click('[data-facet="nav:onepage"]');
    await h.waitForURL(/\/site\/templates\?nav=onepage$/);
    assert.equal(await h.locator('[data-testid=template-grid] article').count(), 3);
    await h.click('[data-facet="content:kinder"]');
    await h.waitForURL(/nav=onepage&content=kinder$/);
    assert.equal(await h.locator('[data-testid=template-grid] article').count(), 1);
    assert.equal(await h.evaluate(() => window.__noReload === true), true);
    await h.goto(`${BASE}/site/templates?first=tiles`); // 주소로 바로 열어도 같은 거르기(서버가 먼저 그림)
    assert.equal(await h.locator('[data-testid=template-grid] article').count(), 1);
    await h.goto(`${BASE}/site/templates`);
    // 89차(ADR 0034): 미리보기는 관리 화면 밖 전체 화면 — 디자인(테마)·메뉴 그대로, 쪽을 넘겨 본다
    await h.click('[data-testid=template-live-project]');
    await h.waitForURL(/\/templates\/project/);
    await h.locator('[data-testid=template-live]').waitFor();
    assert.equal(await h.getAttribute('.site', 'data-theme'), 'studio');
    assert.match(await h.textContent('.site-brand'), /두레프로젝트학교/);
    // 90차: 작품 갤러리형 — 분야로 거르기(과학을 누르면 과학 작품만)
    const works = h.locator('.sec[data-variant="filter"] .sec-photos li');
    assert.equal(await works.count(), 6);
    await h.click('.sec-filter-bar button:has-text("과학")');
    assert.equal(await h.locator('.sec[data-variant="filter"] .sec-photos li:visible').count(), 2);
    await h.click('.sec-filter-bar button:has-text("전체")');
    assert.equal(await h.locator('.sec[data-variant="filter"] .sec-photos li:visible').count(), 6);
    await h.click('.site-nav-tree > li > a:text-is("프로젝트")');
    await h.waitForURL(/page=projects/);
    assert.match(await h.textContent('[data-testid=template-live]'), /마을 하천 지도/);
    await shot(h, '89-template-live.png');
    // #143: client-side page navigation must clear the previous page's filter and hidden DOM state.
    // 126차(ADR 0046): 학생 작품은 '프로젝트' 아래 하위 쪽 — 상위 메뉴에 손을 대면 하위 판이 열린다
    await h.hover('.site-nav-tree > li:has(> a:text-is("프로젝트")) > a');
    await h.click('.site-nav-tree .site-subnav a:text-is("학생 작품")');
    await h.waitForURL(/page=works/);
    assert.equal(await h.getAttribute('.site-nav-tree > li:has(> a:text-is("프로젝트")) > a', 'aria-current'), 'true');
    await h.locator('.sec-filter-bar button', { hasText: '예술' }).press('Enter');
    await h.waitForFunction(() => document.querySelectorAll('.sec-filter li:not([hidden])').length === 2);
    await h.click('.site-nav-tree > li > a:text-is("프로젝트")');
    await h.waitForFunction(() => document.querySelectorAll('.sec-filter li:not([hidden])').length === 3);
    assert.equal(await h.getAttribute('.sec-filter-bar button:first-child', 'aria-pressed'), 'true');
    await h.locator('.sec-filter-bar button', { hasText: '3~4학년' }).click();
    await h.waitForFunction(() => document.querySelectorAll('.sec-filter li:not([hidden])').length === 1);
    assert.match(await h.locator('.sec-filter li:visible').innerText(), /학교 텃밭 장터/);
    await h.locator('.site-nav a', { hasText: /^홈$/ }).click();
    await h.getByRole('link', { name: /새 학기 학부모 설명회 안내/ }).click();
    await h.waitForURL(/news=open-day/);
    assert.match(await h.locator('h1').innerText(), /새 학기 학부모 설명회 안내/);
    await h.getByRole('link', { name: '소식 목록', exact: true }).click();
    await h.waitForURL(/news=all/);
    assert.equal(await h.locator('.lb-board li').count(), 3);
    await h.goto(`${BASE}/templates/kinder?page=admission-apply`); // 135차: 방문·상담 신청은 '입학 안내' 아래 하위 쪽
    await h.locator('[data-testid=site-inquiry] input[name=name]').fill('가상 방문자');
    await h.locator('[data-testid=site-inquiry] input[name=contact]').fill('visitor@example.org');
    await h.locator('[data-testid=site-inquiry] input[name=consent]').check();
    const sent = [];
    h.on('request', (request) => { if (request.url().endsWith('/api/site/inquiry')) sent.push(request.url()); });
    await h.getByTestId('site-inquiry-send').click();
    await h.getByRole('status').filter({ hasText: '실제로 보내지지 않습니다' }).waitFor();
    assert.equal(sent.length, 0, '템플릿 미리보기는 개인정보를 서버로 보내지 않음');

    await h.goto(`${BASE}/site/templates`);
    await shot(h, '65-templates.png');
    await h.click('[data-testid=template-open-story]');
    await h.locator('[data-testid=template-preview]').waitFor();
    assert.match(await h.textContent('[data-testid=template-preview]'), /학교의 하루/);
    // 86차: 기본은 가상 학교 예시 내용 · '안내 자리'로 바꾸면 적용될 그대로
    assert.match(await h.textContent('[data-testid=template-preview]'), /숲속이야기학교/);
    await h.click('[data-testid=template-view-guide]');
    await h.waitForURL(/view=guide/);
    assert.match(await h.textContent('[data-testid=template-preview]'), /\[학교 이름\]/);
    await h.click('nav[aria-label="템플릿 쪽"] a:has-text("교육철학")');
    await h.waitForURL(/page=philosophy/);
    assert.match(await h.textContent('[data-testid=template-preview]'), /우리가 소중히 여기는 것/);
    await shot(h, '65-template-preview.png');
    await h.click('[data-testid=template-apply]');
    await h.locator('[role=status]', { hasText: '시안 쪽' }).waitFor();
    await h.goto(`${BASE}/site?box=page`);
    const list = await h.textContent('.triage-list');
    assert.match(list, /교육철학/);
    assert.match(list, /공동체/);
    // #143: both new filter layouts must expose editable categories after template application.
    await h.goto(`${BASE}/site/templates/project`);
    await h.getByTestId('template-apply').click();
    await h.locator('[role=status]', { hasText: '시안 쪽' }).waitFor();
    for (const title of ['프로젝트', '학생 작품']) {
      await h.goto(`${BASE}/site?box=page`);
      // 135차: '왜 프로젝트로 배우나요' 같은 하위 쪽 제목도 '프로젝트'를 포함하므로 제목 칸이 정확히 같은 항목을 고른다
      await h.locator('.triage-list a').filter({ has: h.locator('.triage-item-title', { hasText: new RegExp(`^${title}$`) }) }).first().click();
      const category = h.getByLabel('1. 분류(거르기 단추) 한국어', { exact: true });
      await category.fill('학교 생태 탐구');
      await h.getByRole('button', { name: '새 판으로 저장', exact: true }).click();
      await h.getByRole('status').filter({ hasText: '새 판으로 저장했습니다' }).waitFor();
      await h.reload();
      assert.equal(await category.inputValue(), '학교 생태 탐구');
      const previewHref = await h.getByRole('link', { name: '시안 미리보기', exact: true }).getAttribute('href');
      await h.goto(`${BASE}${previewHref}`);
      await h.locator('.sec-filter-bar button', { hasText: '학교 생태 탐구' }).click();
      await h.waitForFunction(() => document.querySelectorAll('.sec-filter li:not([hidden])').length === 1);
    }
    // 112차(Codex 검토): 행사 구역은 날짜 배지(분류 칸)를 편집기에서 고칠 수 있다
    const ev = await h.evaluate(async () => (await (await fetch('/api/site/entries', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'page', key: 'e2e-events', content: { title: { ko: 'E2E 행사 쪽' }, blocks: [{ type: 'section', template: 'cards', variant: 'events', items: [{ title: { ko: '학교 여는 날' }, tag: { ko: '[날짜]' } }] }] } }) })).json()));
    assert.ok(ev.id, '행사 쪽 시안');
    await h.goto(`${BASE}/site?box=page`);
    await h.locator('.triage-list a').filter({ hasText: 'E2E 행사 쪽' }).first().click();
    const date = h.getByLabel('1. 날짜(행사 배지) 한국어', { exact: true });
    assert.equal(await date.inputValue(), '[날짜]');
    await date.fill('5.12');
    await h.getByRole('button', { name: '새 판으로 저장', exact: true }).click();
    await h.getByRole('status').filter({ hasText: '새 판으로 저장했습니다' }).waitFor();
    await h.reload();
    assert.equal(await date.inputValue(), '5.12');
    await ctx.close();
  });
  await step('66차: 학교 자료로 빈 칸 채우기 — 이야기형 미리보기에서 소개서 올리기 → 제안 확인 → 넣기 → 교육철학 쪽 새 시안 판', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const h = await ctx.newPage();
    await login(h, 'admin-a@school-a.test', 'demo-pass-a');
    await h.goto(`${BASE}/site/templates/story?page=philosophy`);
    const panel = h.locator('[data-testid=autofill-panel]');
    await panel.waitFor();
    const text = ['우리가 소중히 여기는 가치', '- 질문: 스스로 묻고 탐구한다', '- 공동체: 서로 돌본다', '- 나눔: 배운 것을 마을과 나눈다', '',
      '하루 일과', '아침 산책으로 하루를 열고 오전에는 탐구 수업, 오후에는 프로젝트를 합니다.'].join('\n');
    await panel.locator('[data-testid=autofill-files]').setInputFiles({ name: 'E2E-소개서.txt', mimeType: 'text/plain', buffer: Buffer.from(text) });
    await panel.locator('[data-testid=autofill-proposals] li', { hasText: '소중히 여기는 것' }).waitFor();
    await shot(h, '66-autofill.png');
    await panel.locator('[data-testid=autofill-apply]').click();
    await panel.locator('[role=status]', { hasText: '칸을 채워 새 시안 판' }).waitFor();
    await h.goto(`${BASE}/site?box=page`);
    // 135차: '소중히 여기는 것'은 '교육철학' 아래 하위 쪽이다
    await h.click('.triage-list a:has-text("우리가 소중히 여기는 것")');
    await h.locator('text=자료로 빈 칸 채움').first().waitFor();
    await ctx.close();
  });
  await step('91차: 방문·상담 신청 — 관리자가 신청 받기를 켜고 유치원형 입학 쪽을 공개 → 방문자가 신청 → 관리자만 목록에서 보고 처리', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const h = await ctx.newPage();
    await login(h, 'admin-a@school-a.test', 'demo-pass-a');
    await h.goto(`${BASE}/site?box=settings`);
    await h.check('[data-testid=site-inquiry-open]');
    await h.click('text=설정 저장');
    await h.waitForSelector('[data-testid=site-settings] [role=status]:has-text("저장했습니다")');
    // 유치원형 시작(없는 쪽만 시안) → 입학 쪽 공개(같은 출처 API, 사람 관리자 권한)
    const applied = await h.evaluate(async () => (await fetch('/api/site/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'kinder' }) })).json());
    // 107차: 앞 단계(65차)의 이야기형에도 신청 칸 쪽이 있어 유치원형은 건너뛸 수 있다 → 이미 있는 쪽을 쓴다
    // 135차: 신청 칸은 '입학 안내' 아래 하위 쪽(admission-apply)이다
    const adm = applied.created.find((c) => c.key === 'admission-apply')
      ?? (await h.evaluate(async () => (await (await fetch('/api/site/entries')).json()))).find((e) => e.kind === 'page' && e.key === 'admission-apply');
    assert.ok(adm, '입학 쪽 시안');
    assert.equal(await h.evaluate(async (id) => (await fetch(`/api/site/entries/${id}/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"photo_consent":true}' })).status, adm.id), 200);
    // 방문자(로그인 없음)
    const vctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const v = await vctx.newPage();
    await v.goto(`${BASE}/s/dreamy-a/p/admission-apply`);
    const form = v.locator('[data-testid=site-inquiry]');
    await form.waitFor();
    await form.locator('input[name=name]').fill('합성 보호자');
    await form.locator('input[name=contact]').fill('e2e-parent@example.org');
    await form.locator('textarea[name=message]').fill('견학 날짜를 알고 싶어요');
    await form.locator('[data-testid=site-inquiry-send]').click(); // 동의 없이: 브라우저 필수 검사로 막힘
    assert.equal(await form.locator('[role=status]').count(), 0);
    await form.locator('input[name=consent]').check();
    await form.locator('[data-testid=site-inquiry-send]').click();
    await form.locator('[role=status]').waitFor();
    assert.match(await form.locator('[role=status]').textContent(), /신청을 받았습니다|Thank you|ได้รับแล้ว/); // 학교 기본 언어로 답함
    await shot(v, '91-inquiry-visitor.png');
    await vctx.close();
    // 관리자 목록
    await h.goto(`${BASE}/site`);
    assert.match(await h.textContent('[data-testid=site-inquiries-link]'), /새 1건/);
    await h.click('[data-testid=site-inquiries-link]');
    await h.locator('[data-testid=inquiries]').waitFor();
    assert.match(await h.textContent('[data-testid=inquiries]'), /e2e-parent@example.org/);
    await h.click('[data-testid=inquiry-toggle]');
    await h.locator('[data-testid=inquiry-toggle][aria-pressed=true]').waitFor();
    await shot(h, '91-inquiries-admin.png');
    await ctx.close();
  });
  await step('87차: 주소만 넣고 새 디자인으로 옮기기 — 둘째 탭(138차 후속), 내부 주소는 서버가 거부해 화면에 알린다', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const h = await ctx.newPage();
    await login(h, 'admin-a@school-a.test', 'demo-pass-a');
    await h.goto(`${BASE}/site/templates`);
    // 138차 후속: 템플릿이 첫 탭, 가져오기는 둘째 탭(누르면 쪽을 다시 부르지 않고 주소만 ?tab=import)
    assert.equal(await h.getAttribute('[data-testid=picker-tab-templates]', 'aria-selected'), 'true');
    assert.equal(await h.locator('[data-testid=migrate-start]').isVisible(), false);
    await h.click('[data-testid=picker-tab-import]');
    await h.waitForURL(/\?tab=import$/);
    const panel = h.locator('[data-testid=migrate-start]');
    await panel.waitFor();
    await panel.locator('[data-testid=migrate-start-url]').fill(`${BASE}/`);
    await panel.locator('[data-testid=migrate-start-read]').click();
    await panel.locator('[role=status]', { hasText: /공개 인터넷|포트|내부/ }).waitFor();
    await ctx.close();
  });
  await step('67차: 기존 홈페이지에서 옮기기 — 패널이 보이고, 내부·사설 주소는 서버가 거부해 화면에 알린다', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const h = await ctx.newPage();
    await login(h, 'admin-a@school-a.test', 'demo-pass-a');
    await h.goto(`${BASE}/site/templates/story`);
    const panel = h.locator('[data-testid=migrate-panel]');
    await panel.waitFor();
    await panel.locator('[data-testid=migrate-url]').fill(`${BASE}/`);
    await panel.locator('[data-testid=migrate-read]').click();
    await panel.locator('[role=status]', { hasText: /공개 인터넷|포트|내부/ }).waitFor();
    await shot(h, '67-migrate.png');
    await ctx.close();
  });
  await step('68차: 홍보 페이지 — 로그인 없이 열림, 한국어·English, 로그인 화면에서 들어오고 시작 단추는 템플릿으로', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`);
    await p.click('[data-testid=login-intro-link]');
    await p.waitForURL(/\/intro$/);
    assert.match(await p.textContent('h1'), /AI로 직접 만드는 우리학교 홈페이지, 우리학교 시스템/);
    await shot(p, '68-intro.png');
    await p.click('a[hreflang=en]');
    await p.waitForURL(/lang=en/);
    assert.match(await p.textContent('h1'), /with AI/);
    await shot(p, '68-intro-en.png');
    await p.click('[data-testid=intro-start]');
    await p.waitForURL(/\/login\?next=%2Fsite%2Ftemplates|\/login\?next=\/site\/templates/);
    // 템플릿 공개 주소(홍보용): 로그인 없이 /demo/<key>가 템플릿 화면만 보인다(안내 줄·예시 안내 없음).
    // 로그인하지 않은 사람이 /templates/<key>를 열면 같은 쪽의 공개 주소로 간다. 쪽 넘기기 링크도 /demo 안에 머문다
    await p.goto(`${BASE}/templates/kinder?page=home&lang=ko`);
    await p.waitForURL(/\/demo\/kinder\?page=home&lang=ko$/);
    await p.waitForSelector('[data-testid=template-live]');
    assert.equal(await p.locator('.template-live-bar, .template-live-note').count(), 0);
    const demoNav = await p.locator('.site a[href^="/demo/kinder?page="]').count();
    assert.ok(demoNav > 0);
    assert.equal(await p.locator('.site a[href^="/templates/"]').count(), 0);
    await ctx.close();
  });
  await step('71차: 학교 구조(학교급·학기 구조·학년도·학기 날짜) → 사람 추가·학적 등록·이름 새 판', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const h = await ctx.newPage();
    await login(h, 'admin-b@school-b.test', 'demo-pass-b');
    await h.goto(`${BASE}/academics`);
    // 109차: 학년 체계 고르기가 기본, 학교급 직접 더하기는 접혀 있다
    await h.locator('[data-testid=levels] details summary').click();
    const lv = h.locator('[data-testid=level-form]');
    await lv.locator('label:has-text("이름") input').fill('E2E 중등');
    await lv.locator('label:has-text("코드") input').fill('e2e_mid');
    await lv.locator('button[type=submit]').click();
    await h.locator('[data-testid=levels] li', { hasText: 'E2E 중등' }).waitFor();
    // 119차: 학기 구조·학년도는 각자 탭(주소 ?tab=)에 있다
    await h.locator('[data-testid=academics-tab-terms]').click();
    await h.waitForURL(/tab=terms/);
    const rf = h.locator('[data-testid=rule-form]');
    await rf.locator('textarea').fill('t1 1텀\nt2 2텀\nt3 3텀');
    await rf.locator('input').fill('E2E 학사 규정(3텀제)');
    await rf.locator('button[type=submit]').click();
    await h.locator('[data-testid=period-rule] p.fine', { hasText: '1텀 · 2텀 · 3텀' }).waitFor();
    await h.locator('[data-testid=academics-tab-years]').click();
    await h.waitForURL(/tab=years/);
    const yf = h.locator('[data-testid=year-form]');
    await yf.locator('label:has-text("이름") input').fill('E2E2030');
    await yf.locator('input[type=date]').nth(0).fill('2030-01-10');
    await yf.locator('input[type=date]').nth(1).fill('2031-01-10');
    await yf.locator('button[type=submit]').click();
    await h.locator('[data-testid=terms-E2E2030] button').click();
    await h.locator('[data-testid=years] dt', { hasText: '3텀' }).waitFor();
    await shot(h, '71-academics.png');

    await h.goto(`${BASE}/people`);
    const add = h.locator('[data-testid=person-add]');
    await add.locator('label:has-text("이름") input').first().fill('E2E 학생 하나');
    await add.locator('button[type=submit]').click();
    await h.locator('[data-testid=people-list] a', { hasText: 'E2E 학생 하나' }).click();
    await h.waitForURL(/\/people\?id=/);
    const ef = h.locator('[data-testid=enroll-form]');
    await ef.locator('select').selectOption({ label: 'E2E 중등' });
    await ef.locator('button[type=submit]').click();
    await h.locator('[data-testid=person-detail] li', { hasText: '재학' }).waitFor();
    await shot(h, '71-people.png');
    await ctx.close();
  });
  await step('72차: 수업 — 과목·갈래·갈래 규칙 판 → 학기·학교급 개설 → 담당 지정', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const h = await ctx.newPage();
    await login(h, 'admin-b@school-b.test', 'demo-pass-b');
    await h.goto(`${BASE}/courses`);
    const sf = h.locator('[data-testid=subject-form]');
    await sf.locator('label:has-text("이름") input').fill('E2E 수학');
    await sf.locator('label:has-text("코드") input').fill('E2EMATH');
    await sf.locator('button[type=submit]').click();
    await h.locator('[data-testid=subjects] li', { hasText: 'E2E 수학' }).waitFor();
    const tf = h.locator('[data-testid=type-form]');
    await tf.locator('label:has-text("이름") input').fill('E2E 필수');
    await tf.locator('label:has-text("코드") input').fill('e2e_req');
    await tf.locator('button[type=submit]').click();
    const tli = h.locator('[data-testid=types] li', { hasText: 'E2E 필수' });
    await tli.waitFor();
    await tli.locator('summary').click();
    await h.locator('[data-testid=type-rule-e2e_req] button[type=submit]').click();
    await h.locator('[data-testid=types] li', { hasText: '1판' }).waitFor();
    const pick = h.locator('[data-testid=offerings] form.row-wrap');
    await pick.locator('select[name=term]').selectOption({ label: 'E2E2030 1텀' });
    await pick.locator('select[name=level]').selectOption({ label: 'E2E 중등' });
    await pick.locator('button[type=submit]').click();
    await h.locator('[data-testid=offerings] h2', { hasText: 'E2E2030 1텀 · E2E 중등' }).waitFor();
    await h.locator('[data-testid=offerings] summary', { hasText: '수업 개설' }).click();
    const of = h.locator('[data-testid=offering-form]');
    await of.locator('label:has-text("과목") select').selectOption({ label: 'E2E 수학' });
    await of.locator('label:has-text("갈래") select').selectOption({ label: 'E2E 필수' });
    await of.locator('button[type=submit]').click();
    await h.locator('[data-testid=offerings] td a', { hasText: 'E2E 수학' }).click();
    await h.waitForURL(/\/courses\?.*o=/);
    const st = h.locator('[data-testid=staff-form]');
    await st.locator('select').first().selectOption({ label: 'E2E 학생 하나' });
    await st.locator('button[type=submit]').click();
    await h.locator('[data-testid=offering-detail] li', { hasText: 'E2E 학생 하나' }).waitFor();
    await shot(h, '72-courses.png');
    await ctx.close();
  });
  await step('73차: 성적 — 학기 시작(자동 수강) → 평가 항목 → 점수 표 저장 → 과목 서술 → 수업 마감 판', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const h = await ctx.newPage();
    h.on('dialog', (d) => d.accept());
    await login(h, 'admin-b@school-b.test', 'demo-pass-b');
    await h.goto(`${BASE}/courses`);
    const pick = h.locator('[data-testid=offerings] form.row-wrap');
    await pick.locator('select[name=term]').selectOption({ label: 'E2E2030 1텀' });
    await pick.locator('select[name=level]').selectOption({ label: 'E2E 중등' });
    await pick.locator('button[type=submit]').click();
    await h.locator('[data-testid=start-term] button[type=submit]').click();
    await h.locator('[data-testid=offerings] td', { hasText: '진행' }).first().waitFor();
    await h.locator('[data-testid=offerings] td a', { hasText: 'E2E 수학' }).click();
    await h.locator('[data-testid=roster] li', { hasText: 'E2E 학생 하나' }).waitFor();
    await h.click('[data-testid=to-grades]');
    await h.waitForURL(/\/grades\?o=/);
    const af = h.locator('[data-testid=assessment-form]');
    await af.locator('label:has-text("이름") input').fill('중간');
    await af.locator('label:has-text("코드") input').fill('mid');
    await af.locator('button[type=submit]').click();
    await h.locator('[data-testid=assessments] li', { hasText: '중간' }).waitFor();
    const cell = h.locator('[data-testid=result-grid] input[aria-label="E2E 학생 하나 중간"]');
    await cell.fill('92');
    await h.locator('[data-testid=result-grid] button[type=submit]').click();
    await h.locator('[data-testid=result-grid] [role=status]', { hasText: '1칸' }).waitFor();
    const nf = h.locator('[data-testid^=narrative-]').first();
    await nf.locator('textarea').fill('E2E 과목 서술: 탐구 과정을 꾸준히 기록함.');
    await nf.locator('button[type=submit]').click();
    await nf.locator('[role=status]', { hasText: '새 사건' }).waitFor();
    await h.locator('[data-testid=close-form] button[type=submit]').click();
    await h.locator('[data-testid=closure-results] td', { hasText: '이수' }).waitFor();
    assert.match(await h.textContent('[data-testid=closure-results]'), /92/);
    await shot(h, '73-grades.png');
    await ctx.close();
  });
  await step('74차: 출결 — 학교급 출결부에서 결석·사유 저장 → 다시 열면 남아 있고, 요약 표가 보인다', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const h = await ctx.newPage();
    await login(h, 'admin-b@school-b.test', 'demo-pass-b');
    await h.goto(`${BASE}/attendance`);
    const pick = h.locator('[data-testid=attendance-day] form.row-wrap');
    await pick.locator('select[name=level]').selectOption({ label: 'E2E 중등' });
    await pick.locator('button[type=submit]').click();
    await h.locator('[data-testid=attendance-day] h2', { hasText: 'E2E 중등' }).waitFor();
    const reg = h.locator('[data-testid=register]');
    await reg.locator('select[aria-label="E2E 학생 하나 출결"]').selectOption('absent');
    await reg.locator('select[aria-label="E2E 학생 하나 사유"]').selectOption('illness');
    await reg.locator('input[aria-label="E2E 학생 하나 메모"]').fill('E2E 감기');
    await reg.locator('button[type=submit]').click();
    await reg.locator('[role=status]', { hasText: '1명' }).waitFor();
    await h.reload();
    assert.equal(await h.locator('[data-testid=register] select[aria-label="E2E 학생 하나 출결"]').inputValue(), 'absent');
    await h.locator('[data-testid=attendance-summary]').waitFor();
    await shot(h, '74-attendance.png');
    await ctx.close();
  });
  await step('75차: 기록 — 학년도 기록 마감 판 → 학생부 발행 → 발행본(스냅샷·해시 확인) → 공개 기록, 지정일 보고', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const h = await ctx.newPage();
    h.on('dialog', (d) => d.accept());
    await login(h, 'admin-b@school-b.test', 'demo-pass-b');
    await h.goto(`${BASE}/records`);
    await h.locator('[data-testid=record-student] select[name=p]').selectOption({ label: 'E2E 학생 하나' });
    await h.locator('[data-testid=record-student] button[type=submit]').click();
    await h.waitForURL(/\/records\?p=/);
    const cy = h.locator('[data-testid=close-year-form]');
    await cy.locator('select').selectOption({ label: 'E2E2030' });
    await cy.locator('button[type=submit]').click();
    await h.locator('[data-testid=record-years] li', { hasText: '1판' }).waitFor();
    const pf = h.locator('[data-testid=publish-form]');
    await pf.locator('label:has-text("형식") select').selectOption('kr_alt_record');
    await pf.locator('button[type=submit]').click();
    await h.locator('[data-testid=record-docs] li a').first().click();
    await h.waitForURL(/\/records\/doc\//);
    await h.locator('[data-testid=record-doc]', { hasText: 'E2E 수학' }).waitFor();
    assert.match(await h.textContent('[data-testid=record-doc]'), /92/);
    await h.locator('.page-header', { hasText: '내용 확인됨' }).waitFor();
    const df = h.locator('[data-testid=disclose-form]');
    await df.locator('label:has-text("받는 곳") input').fill('E2E 입학처');
    await df.locator('button[type=submit]').click();
    await h.locator('[data-testid=disclosures] li', { hasText: 'E2E 입학처' }).waitFor();
    await shot(h, '75-record-doc.png');
    await h.goto(`${BASE}/records`);
    await h.locator('[data-testid=count-report-form] button[type=submit]').click();
    await h.locator('[data-testid=count-reports] li', { hasText: '1판' }).waitFor();
    await ctx.close();
  });
  await step('76차: 기본판·보고 — 관제가 보고 모으기 → 새 기본판(코드 하나 더함) → 학교 설정에서 제안 수락 → 사본 판이 오름', async () => {
    const ctxP = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const p = await ctxP.newPage();
    p.on('dialog', (d) => d.accept());
    await p.goto(`${BASE}/login`);
    await p.fill('input[name=email]', 'platform@example.test');
    await p.fill('input[name=password]', 'demo-pass-p');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/admin$/);
    await p.goto(`${BASE}/admin/baseline`);
    await p.locator('[data-testid=collect-reports] button[type=submit]').click();
    await p.locator('[data-testid=reports] tbody th', { hasText: '드리미 예시학교' }).waitFor();
    await p.locator('[data-testid=baseline] summary').click();
    const bf = p.locator('[data-testid=baseline-form]');
    const m = JSON.parse(await bf.locator('textarea').inputValue());
    m.code_lists = [...(m.code_lists ?? []), { list_key: 'attendance_reason', code: 'e2e_event', label: { ko: 'E2E 행사', en: 'E2E event' }, attrs: { excused: true }, why: 'e2e' }];
    await bf.locator('textarea').fill(JSON.stringify(m));
    await bf.locator('label:has-text("왜") input').fill('E2E: 행사 사유 추가');
    await bf.locator('button[type=submit]').click();
    await bf.locator('[role=status]', { hasText: '새 기본판' }).waitFor();
    await shot(p, '76-baseline.png');
    await ctxP.close();

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const h = await ctx.newPage();
    await login(h, 'admin-a@school-a.test', 'demo-pass-a');
    await h.goto(`${BASE}/settings`);
    const box = h.locator('[data-testid=baseline-offers]');
    await box.locator('li', { hasText: 'attendance_reason e2e_event' }).waitFor();
    await box.locator('form button[type=submit]').first().click();
    await box.locator('form').waitFor({ state: 'detached' });
    assert.match(await box.textContent(), /지금 사본: 2판/);
    await ctx.close();
  });
  await step('81차: 연구소 — 카드로 한눈에 → 상세에서 본문을 표·지표·흐름도로 고치고 미리 보기 → 저장하면 그대로 보인다', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill('input[name=email]', 'platform@example.test');
    await p.fill('input[name=password]', 'demo-pass-p');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/admin$/);
    await p.goto(`${BASE}/admin/lab`);
    await p.locator('[data-testid=lab-items] li.lab-card').first().waitFor();
    await shot(p, '81-lab-cards.png');
    // 제목 글자가 아니라 카드 빈 곳(아래쪽 꼬리)을 눌러도 상세로 간다
    const card = p.locator('[data-testid=lab-items] li', { hasText: 'AI 분석 프롬프트 설계' });
    const box = await card.boundingBox();
    await card.click({ position: { x: box.width / 2, y: box.height - 8 } });
    await p.waitForURL(/\/admin\/lab\/[0-9a-f-]{36}$/);
    await p.locator('[data-testid=lab-controls] button:text-is("내용 고치기")').click();
    const ed = p.locator('[data-testid=lab-editor]');
    await ed.locator('textarea').fill('## 비용 요약\n\n```kpi\n월 원가 | $260 | 100곳\n```\n\n| 등급 | 원가 |\n|---|---|\n| 공용형 | $1 |\n\n```steps\n신청 | 승인\n생성\n```\n\n> **결정** 등급 이름');
    await ed.locator('button[role=tab]:text-is("미리 보기")').click();
    await ed.locator('.rd-kpi', { hasText: '$260' }).waitFor();
    await ed.locator('button:text-is("저장")').click();
    const body = p.locator('[data-testid=lab-body]');
    await body.locator('.rd-kpi-value', { hasText: '$260' }).waitFor();
    assert.equal(await body.locator('table tbody tr').count(), 1);
    assert.equal(await body.locator('.rd-step').count(), 2);
    await body.locator('.rd-decide').waitFor();
    await p.locator('.lab-toc a', { hasText: '비용 요약' }).waitFor();
    await shot(p, '81-lab-detail.png');
    await ctx.close();
  });
  await step('37차 후속: 손가락 기기 — 전체 관리·연구소·자료 첨부·화면 편집의 입력과 단추가 모두 44px, 필수 칸은 * 표시', async () => {
    const { devices } = require('playwright');
    // 화면에 보이는 입력·단추 중 44px 미만(화면 편집 막대 포함, 공개 홈페이지 본문 .site 의 테마 요소는 제외)
    const under44 = (page) => page.evaluate(() => [...document.querySelectorAll('main :is(button, .btn, select, textarea, input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]):not([type=file]))')]
      .filter((e) => (!e.closest('.site') || e.closest('.le-bar, .le-switch, .le-note, .le-picker, .le-guide')) && !e.closest('.pv-root'))
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5; })
      .map((e) => `${e.tagName}.${(e.className || '').toString().split(' ')[0]}「${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 10)}」:${Math.round(e.getBoundingClientRect().height)}`));
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill('input[name=email]', 'platform@example.test');
    await p.fill('input[name=password]', 'demo-pass-p');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/admin$/);
    for (const path of ['/admin', '/admin/lab']) {
      await p.goto(`${BASE}${path}`);
      await p.locator('main').waitFor();
      const small = await under44(p);
      assert.deepEqual(small, [], `${path} 44px 미만: ${small.join(' ')}`);
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${path} 390px 가로 넘침`);
    }
    await p.goto(`${BASE}/admin/languages`);
    await p.locator('[data-testid=language-form] .field-req').first().waitFor();
    await ctx.close();
    // 학교 관리자: 자료 첨부(FileDrop 단추)와 화면 편집(구역 막대)
    const ctxA = await browser.newContext({ ...devices['iPhone 13'] });
    const a2 = await ctxA.newPage();
    await login(a2, 'admin-a@school-a.test', 'demo-pass-a');
    await a2.goto(`${BASE}/intake`);
    await a2.waitForSelector('[data-testid=dropzone][data-ready]');
    assert.deepEqual(await under44(a2), [], '자료 첨부 44px 미만');
    await a2.goto(`${BASE}/site?box=page`);
    await a2.locator('[data-testid=row-live-edit]').first().click();
    await a2.waitForURL(/\/site\/edit\/[0-9a-f-]{36}$/);
    await a2.locator('[data-testid=live-editor] .le-bar').first().waitFor();
    const smallEd = await under44(a2);
    assert.deepEqual(smallEd, [], `화면 편집 44px 미만: ${smallEd.join(' ')}`);
    await ctxA.close();
  });

  await step('138차 후속: 휴대폰 공개 홈페이지 — 아래로 내리면 메뉴 단추가 위에 떠서 열 수 있고, 맨 위로 오면 제자리', async () => {
    const { devices } = require('playwright');
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/demo/story?page=philosophy`, { waitUntil: 'networkidle' });
    const btn = p.locator('.site-header > .site-menu > summary');
    const top = () => btn.evaluate((el) => Math.round(el.getBoundingClientRect().top));
    assert.equal(await p.locator('.site-header[data-away]').count(), 0);
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.locator('.site-header[data-away]').waitFor({ state: 'attached' });
    const t = await top();
    assert.ok(t >= 0 && t < 40, `떠 있는 메뉴 단추가 화면 위에 보여야 함(${t})`);
    await btn.click();
    await p.locator('.site-header > .site-menu nav').waitFor();
    assert.ok(await p.locator('.site-header > .site-menu nav').isVisible());
    await btn.click();
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForFunction(() => !document.querySelector('.site-header')?.hasAttribute('data-away'));
    // 교직원 막대(위에 붙어 따라옴)가 있으면 단추는 막대 아래에 뜬다 — 미리보기에는 막대가 없어 같은 모양의 막대를 넣어 본다
    await p.evaluate(() => {
      const bar = document.createElement('nav'); bar.className = 'site-admin-bar'; bar.dataset.stickyTop = ''; bar.textContent = '학교 관리자 · 이 화면 편집 · 소식 쓰기 · 홈페이지 관리 · 개선 요청';
      document.querySelector('.site').prepend(bar);
    });
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.locator('.site-header[data-away]').waitFor({ state: 'attached' });
    const [barBottom, btnTop] = await p.evaluate(() => [document.querySelector('.site-admin-bar').getBoundingClientRect().bottom, document.querySelector('.site-header > .site-menu > summary').getBoundingClientRect().top]);
    assert.ok(btnTop >= barBottom, `메뉴 단추(${btnTop})가 교직원 막대(${barBottom}) 아래에 있어야 함`);
    // 템플릿 미리보기(로그인한 사람, 위에 미리보기 막대)에서도 단추가 막대를 덮지 않는다
    await login(p, 'admin-a@school-a.test', 'demo-pass-a');
    await p.goto(`${BASE}/templates/story?page=philosophy`, { waitUntil: 'networkidle' });
    await p.locator('.template-live-bar').waitFor();
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.locator('.site-header[data-away]').waitFor({ state: 'attached' });
    const [liveBottom, btnTop2] = await p.evaluate(() => [document.querySelector('.template-live-bar').getBoundingClientRect().bottom, document.querySelector('.site-header > .site-menu > summary').getBoundingClientRect().top]);
    assert.ok(btnTop2 >= liveBottom, `미리보기: 메뉴 단추(${btnTop2})가 미리보기 막대(${liveBottom}) 아래에 있어야 함`);
    // 막대가 창 크기 변화 없이 높아져도(안내 줄이 붙는 경우) 단추가 따라 내려간다
    await p.evaluate(() => { const n = document.createElement('p'); n.textContent = '저장했습니다'; n.style.padding = '24px 0'; document.querySelector('.template-live-bar').append(n); });
    await p.waitForFunction(() => document.querySelector('.site-header > .site-menu > summary').getBoundingClientRect().top >= document.querySelector('.template-live-bar').getBoundingClientRect().bottom);
    await ctx.close();
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
