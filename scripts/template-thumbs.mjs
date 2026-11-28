#!/usr/bin/env node
// 86·89차: 홈페이지 템플릿 둘러보기 카드의 썸네일(가상 학교 예시 내용).
// 89차(ADR 0034): 전체 화면 미리보기(/templates/<key>)를 찍어 '첫 화면(넓게) + 그 아래 구역 + 휴대폰 화면'을 겹친 그림으로 만든다.
// 로컬 서버(로컬 DB + 합성 시드)에서만 돈다. 결과: public/site-templates/<key>.jpg (960×600)
//   npm run templates:thumbs            # 모든 템플릿
//   npm run templates:thumbs -- story   # 하나만
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { ACCOUNTS } from './ui-review.pages.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = (process.env.UI_BASE ?? 'http://localhost:3000').replace(/\/$/, '');
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error(`로컬 주소만 씁니다(${BASE}).`); process.exit(2); }
const only = process.argv.slice(2);
const OUT = 'public/site-templates';
const TMP = '.ui-review/thumbs';
mkdirSync(OUT, { recursive: true }); mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const acc = ACCOUNTS['admin-a'];
  await page.goto(`${BASE}/login`);
  await page.fill('input[name=email]', acc.email);
  await page.fill('input[name=password]', acc.password);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
  await page.goto(`${BASE}/site/templates`, { waitUntil: 'networkidle' });
  const keys = (await page.locator('[data-testid^=template-open-]').evaluateAll((els) => els.map((e) => e.dataset.testid.replace('template-open-', ''))))
    .filter((k) => only.length === 0 || only.includes(k));
  if (keys.length === 0) throw new Error('템플릿을 찾지 못했습니다(홈페이지 기능이 켜져 있는지 확인).');
  const phone = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 1, storageState: await ctx.storageState() });
  const phonePage = await phone.newPage();
  // 1600×1000 판을 0.6배로 저장(960×600)
  const boardCtx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 0.6 });
  const shot = async (p, url, file) => {
    await p.goto(url, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: file, type: 'png' });
    return `data:image/png;base64,${readFileSync(file).toString('base64')}`;
  };
  for (const key of keys) {
    const live = `${BASE}/templates/${key}?thumb=1`;
    const home = await shot(page, live, `${TMP}/${key}-home.png`);
    // 둘째 화면: 첫 화면 아래(카드·사진 구역)
    await page.evaluate(() => window.scrollTo(0, 820));
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${TMP}/${key}-lower.png` });
    const second = `data:image/png;base64,${readFileSync(`${TMP}/${key}-lower.png`).toString('base64')}`;
    const mobile = await shot(phonePage, live, `${TMP}/${key}-phone.png`);
    const board = await boardCtx.newPage();
    await board.setContent(`<!doctype html><html><body style="margin:0;width:1600px;height:1000px;overflow:hidden;background:linear-gradient(135deg,#eef1f5,#dfe5ec);position:relative;font-family:sans-serif">
      <img src="${second}" style="position:absolute;left:640px;top:150px;width:900px;border-radius:14px;box-shadow:0 20px 50px rgba(20,30,50,.25)">
      <img src="${home}" style="position:absolute;left:50px;top:60px;width:1080px;border-radius:14px;box-shadow:0 24px 60px rgba(20,30,50,.3)">
      <div style="position:absolute;right:70px;bottom:40px;width:250px;height:500px;border-radius:34px;background:#101418;padding:12px;box-shadow:0 24px 50px rgba(20,30,50,.35)">
        <div style="width:100%;height:100%;border-radius:24px;overflow:hidden;background:#fff"><img src="${mobile}" style="width:100%;display:block"></div></div>
    </body></html>`);
    await board.screenshot({ path: `${OUT}/${key}.jpg`, type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 1600, height: 1000 } });
    await board.close();
    console.log(`${key}: ${OUT}/${key}.jpg`);
  }
} finally {
  await browser.close();
  rmSync(TMP, { recursive: true, force: true });
}
