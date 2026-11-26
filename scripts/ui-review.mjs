// UI 점검 루프 4-1·4-2(docs/UI_REVIEW.md): 화면 캡처 + 기계 검사. 모델 호출 없음.
// 사용: node scripts/ui-review.mjs <페이지 이름…|--all> [--base http://localhost:3000]
//   페이지 목록은 scripts/ui-review.pages.mjs. 서버는 미리 띄워 둔다(npm run dev 또는 build+start, 로컬 DB + 시드).
// 결과: .ui-review/<페이지>/<상태>-<뷰포트너비>.png, machine.json, machine.md
// 기계 검사: 콘솔 오류 · 가로 스크롤(scrollWidth > clientWidth) · 접근성(axe serious 이상)
//   색상 린트는 화면과 무관하게 npm run lint:colors 가 따로 본다.
// 종료 코드: 기계 검사 실패가 하나라도 있으면 1(Codex 점검 전에 먼저 고친다).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PAGES, ACCOUNTS } from './ui-review.pages.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const BASE = (baseIdx >= 0 ? args.splice(baseIdx, 2)[1] : process.env.UI_BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const names = args.includes('--all') ? Object.keys(PAGES) : args;
if (!names.length) {
  console.error(`페이지 이름을 주세요. 있는 이름: ${Object.keys(PAGES).join(', ')} (모두는 --all)`);
  process.exit(2);
}
const unknown = names.filter((n) => !PAGES[n]);
if (unknown.length) { console.error(`모르는 페이지: ${unknown.join(', ')}`); process.exit(2); }
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) && !process.env.UI_ALLOW_REMOTE) {
  // 예시 계정 비밀번호로 로그인하므로 기본은 로컬만. 다른 주소는 UI_ALLOW_REMOTE=1 로 명시한다
  console.error(`로컬 주소만 점검합니다(${BASE}). 다른 주소는 UI_ALLOW_REMOTE=1 을 함께 주세요.`);
  process.exit(2);
}

const VIEWPORTS = [{ w: 390, h: 844 }, { w: 768, h: 1024 }, { w: 1440, h: 900 }];
const root = path.resolve(import.meta.dirname, '..', '.ui-review');

async function login(page, who) {
  const acc = ACCOUNTS[who];
  if (!acc) throw new Error(`모르는 계정: ${who}`);
  await page.goto(`${BASE}/login`);
  await page.fill('input[name=email]', acc.email);
  await page.fill('input[name=password]', acc.password);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
}

const browser = await chromium.launch(process.env.HTTPS_PROXY && !/localhost|127\.0\.0\.1/.test(BASE) ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
let failed = 0;
try {
  for (const name of names) {
    const def = PAGES[name];
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    const results = [];
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const page = await ctx.newPage();
      const consoleErrors = [];
      // 리소스 404 콘솔 문구에는 주소가 없어, 같은 출처 응답 4xx·5xx 를 주소와 함께 따로 잡는다
      page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) consoleErrors.push(m.text().slice(0, 300)); });
      page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) consoleErrors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
      page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 300)}`));
      if (def.login) await login(page, def.login);
      for (const [state, target] of Object.entries(def.states)) {
        consoleErrors.length = 0;
        const url = typeof target === 'function' ? await target({ page, BASE }) : `${BASE}${target}`;
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForTimeout(300);
        const file = `${state}-${vp.w}.png`;
        await page.screenshot({ path: path.join(dir, file), fullPage: true });
        const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        await page.addScriptTag({ content: AXE });
        const axe = await page.evaluate(async () => {
          const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
          return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
            .map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length, where: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
        });
        const issues = [
          ...consoleErrors.map((t) => ({ kind: 'console', text: t })),
          ...(scroll.sw > scroll.cw ? [{ kind: 'h-scroll', text: `가로 스크롤 ${scroll.sw}px > ${scroll.cw}px` }] : []),
          ...axe.map((v) => ({ kind: 'axe', text: `${v.id}(${v.impact}) ${v.count}곳: ${v.where.join(' | ')}` })),
        ];
        if (issues.length) failed += issues.length;
        results.push({ file, state, width: vp.w, url: new URL(url).pathname, issues });
      }
      await ctx.close();
    }
    fs.writeFileSync(path.join(dir, 'machine.json'), JSON.stringify({ page: name, base: BASE, at: new Date().toISOString(), results }, null, 2));
    const md = [`# 기계 검사 · ${name}`, '', `- 화면 ${results.length}장 · 문제 ${results.reduce((n, r) => n + r.issues.length, 0)}건`, '',
      '| 파일 | 경로 | 결과 |', '|---|---|---|',
      ...results.map((r) => `| ${r.file} | ${r.url} | ${r.issues.length ? r.issues.map((i) => `${i.kind}: ${i.text}`).join('<br>') : '통과'} |`), ''];
    fs.writeFileSync(path.join(dir, 'machine.md'), md.join('\n'));
    console.log(`${name}: 화면 ${results.length}장, 문제 ${results.reduce((n, r) => n + r.issues.length, 0)}건 → .ui-review/${name}/`);
  }
} finally {
  await browser.close();
}
if (failed) { console.error(`기계 검사 실패 ${failed}건. Codex 점검 전에 먼저 고치세요(.ui-review/<페이지>/machine.md).`); process.exit(1); }
