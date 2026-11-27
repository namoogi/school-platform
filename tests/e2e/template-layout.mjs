// 100차: representative templates, all pages at desktop/tablet/phone widths.
// Run against a local seeded server: node tests/e2e/template-layout.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ACCOUNTS, PAGES } from '../../scripts/ui-review.pages.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.UI_BASE ?? 'http://localhost:3000';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/);
// Runs in the page, including after each category change. Check every row, not just the first.
function cardIssues() {
  const failures = [];
  const near = (a, b) => Math.abs(a - b) < 2;
  for (const grid of document.querySelectorAll('ul[data-layout="cards"]')) {
    const visible = [...grid.children].filter(el => !el.hidden);
    const cards = visible.map(el => el.getBoundingClientRect());
    if (Number(grid.dataset.count) !== cards.length) failures.push('stale visible card count');
    const rows = [];
    for (const card of cards) {
      let row = rows.find(row => near(row[0].top, card.top));
      if (!row) rows.push(row = []);
      row.push(card);
    }
    const rect = grid.getBoundingClientRect();
    const section = grid.closest('.sec, .site-section').getBoundingClientRect();
    for (const row of rows) {
      if (!near(row[0].left, section.left) || !near(row.at(-1).right, section.right) || !near(row.at(-1).right, rect.right)) failures.push('unfilled card row (including last row)');
      if (row.some(card => !near(card.height, row[0].height))) failures.push('unequal card heights');
    }
    if (innerWidth === 1440 && cards.length) {
      const count = cards.length;
      const expected = count <= 2 ? count : count % 4 === 0 ? 4 : count % 3 === 0 ? 3 : count % 2 === 0 ? 2 : 3;
      if (rows[0].length !== expected) failures.push(`wrong columns for ${count} cards`);
    }
    for (const el of visible) for (const img of el.querySelectorAll('img')) {
      const photo = img.getBoundingClientRect();
      if (Math.abs(photo.width / photo.height - 4 / 3) > .02) failures.push('card photo is not 4:3');
    }
  }
  return failures;
}
const browser = await chromium.launch();
let checked = 0;
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.fill('input[name=email]', ACCOUNTS['admin-a'].email);
  await page.fill('input[name=password]', ACCOUNTS['admin-a'].password);
  await page.click('button[type=submit]');
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const key of ['story', 'project', 'kinder']) {
      for (const path of Object.values(PAGES[`template-${key}`].states)) {
        await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        const issues = await page.evaluate(() => {
          const failures = [];
          const near = (a, b) => Math.abs(a - b) < 2;
          const main = document.querySelector('.site-main').getBoundingClientRect();
          if (document.documentElement.scrollWidth > innerWidth) failures.push('horizontal overflow');
          for (const section of document.querySelectorAll('.site-blocks > :is(.sec, .site-section)')) {
            const rect = section.getBoundingClientRect();
            if (!near(rect.left, main.left) || !near(rect.right, main.right)) failures.push('section outside content grid');
            if (section.dataset.template !== 'banner') {
              const padding = getComputedStyle(section).paddingTop;
              if (!['80px', '48px'].includes(padding)) failures.push(`section spacing: ${padding}`);
            }
          }
          const footer = document.querySelector('.site-footer-grid');
          const menu = footer.querySelector(':scope > nav');
          const heading = menu.querySelector('h3');
          if (!heading || !heading.textContent.trim() || menu.firstElementChild !== heading) failures.push('missing menu heading');
          const links = [...menu.querySelectorAll('a')].map(el => el.getBoundingClientRect());
          const gap = parseFloat(getComputedStyle(menu).rowGap);
          if (gap < 8 || gap > 12) failures.push('footer menu gap is not compact');
          for (const [i, link] of links.entries()) {
            if (link.height < 24) failures.push('footer menu target below 24px');
            // Synthetic sample labels are single-line; catch the old 48px minimum height.
            if (link.height > 32) failures.push('footer menu link too tall');
            if (i && !near(link.top - links[i - 1].bottom, gap)) failures.push('footer menu links spread vertically');
          }
          if (innerWidth > 900 && heading) {
            for (const peer of footer.querySelectorAll('.site-footer-contact h3, .site-footer-address h3')) {
              if (!near(heading.getBoundingClientRect().top, peer.getBoundingClientRect().top)) failures.push('footer headings not top aligned');
            }
          }
          return failures;
        });
        assert.deepEqual(issues, [], `${path} at ${width}`);
        assert.deepEqual(await page.evaluate(cardIssues), [], `${path} card rows at ${width}`);
        for (const filter of await page.locator('.sec-filter:has(ul[data-layout="cards"])').all()) {
          const buttons = filter.locator('.sec-filter-bar button');
          for (const button of await buttons.all()) {
            await button.click();
            await page.waitForFunction(() => [...document.querySelectorAll('.sec-filter ul[data-layout="cards"]')].every(grid => {
              const buttons = [...grid.parentElement.querySelectorAll('.sec-filter-bar button')];
              const selected = buttons.find(button => button.getAttribute('aria-pressed') === 'true');
              const tag = selected === buttons[0] ? null : selected.textContent;
              return [...grid.children].every(el => el.hidden === (tag !== null && el.dataset.tag !== tag))
                && Number(grid.dataset.count) === [...grid.children].filter(el => !el.hidden).length;
            }));
            assert.deepEqual(await page.evaluate(cardIssues), [], `${path} filtered card rows at ${width}`);
          }
          await buttons.first().click();
        }
        if (width <= 900) {
          const menu = page.locator('.site-menu-kit');
          assert.equal(await menu.isVisible(), true);
          assert.equal(await page.locator('.site-nav-desktop').isVisible(), false);
          await menu.locator('summary').focus();
          await page.keyboard.press('Enter');
          assert.equal(await menu.getAttribute('open') !== null, true);
          await page.keyboard.press('Escape');
          assert.equal(await menu.getAttribute('open'), null);
        }
        checked++;
      }
    }
  }
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/templates/project`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const filter = page.locator('.sec-filter:has(ul[data-layout="cards"])').first();
    const original = await filter.locator('ul > li').evaluateAll(items => items.map(item => item.outerHTML));
    assert.ok(original.length, 'project work cards exist');
    for (const count of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      await filter.locator('ul').evaluate((list, { original, count }) => {
        list.innerHTML = Array.from({ length: count }, (_, i) => original[i % original.length]).join('');
      }, { original, count });
      const buttons = filter.locator('.sec-filter-bar button');
      await buttons.nth(1).click();
      await buttons.first().click();
      await page.waitForFunction(count => document.querySelector('.sec-filter ul[data-layout="cards"]').dataset.count === String(count), count);
      assert.deepEqual(await page.evaluate(cardIssues), [], `project ${count} visible works at ${width}`);
    }
  }
  console.log(`Template layout: ${checked} pages/viewports passed`);
} finally {
  await browser.close();
}
