#!/usr/bin/env node
// 86차: 홈페이지 템플릿 둘러보기 카드의 썸네일을 찍는다(가상 학교 예시 내용으로 채운 첫 화면).
// 로컬 서버(로컬 DB + 합성 시드, 예시학교에 homepage 기능이 켜져 있어야 함)에서만 돈다. 결과: public/site-templates/<key>.jpg
//   npm run templates:thumbs            # 모든 템플릿
//   npm run templates:thumbs -- story   # 하나만
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { ACCOUNTS } from './ui-review.pages.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = (process.env.UI_BASE ?? 'http://localhost:3000').replace(/\/$/, '');
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error(`로컬 주소만 씁니다(${BASE}).`); process.exit(2); }
const only = process.argv.slice(2);
const OUT = 'public/site-templates';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
try {
  // 1600 폭 화면에서 미리보기를 그려 3/4 크기로 저장한다
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 0.75 })).newPage();
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
  for (const key of keys) {
    await page.goto(`${BASE}/site/templates/${key}?view=sample`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const el = page.locator('[data-testid=template-preview]');
    const box = await el.boundingBox();
    if (!box) throw new Error(`${key}: 미리보기를 찾지 못했습니다`);
    const width = Math.floor(box.width);
    const height = Math.round(width * 10 / 16); // 쪽이 짧아도 카드 비율(16:10)로 찍는다
    await page.screenshot({ path: `${OUT}/${key}.jpg`, type: 'jpeg', quality: 82, clip: { x: box.x, y: box.y, width, height }, fullPage: true });
    console.log(`${key}: ${OUT}/${key}.jpg`);
  }
} finally {
  await browser.close();
}
