// UI 점검 대상 페이지 목록(docs/UI_REVIEW.md 4-1). 상태 이름 → 경로(또는 경로를 찾는 함수).
// 상태 이름은 파일명 앞부분이 된다: default · empty · many · error. 해당하는 것만 둔다.
// 계정은 로컬 시드의 합성 예시 계정(실제 사람 아님). 운영 비밀번호는 쓰지 않는다.
export const ACCOUNTS = {
  'admin-a': { email: 'admin-a@school-a.test', password: process.env.UI_PASS_A ?? 'demo-pass-a' },
  'admin-b': { email: 'admin-b@school-b.test', password: process.env.UI_PASS_B ?? 'demo-pass-b' },
  platform: { email: 'platform@example.test', password: process.env.UI_PASS_P ?? 'demo-pass-p' },
};

/** 목록 화면에서 첫 링크를 따라가 상세 경로를 찾는다(없으면 목록 그대로) */
const firstLink = (list, selector) => async ({ page, BASE }) => {
  await page.goto(`${BASE}${list}`, { waitUntil: 'networkidle' });
  const href = await page.locator(selector).first().getAttribute('href').catch(() => null);
  return `${BASE}${href ?? list}`;
};

/** 목록에서 링크를 차례로 따라간다(앞 링크가 없으면 거기서 멈춤). `npm run ui:seed`로 채운 상태를 찍을 때 쓴다 */
const follow = (start, selectors) => async ({ page, BASE }) => {
  let url = `${BASE}${start}`;
  for (const sel of selectors) {
    await page.goto(url, { waitUntil: 'networkidle' });
    const href = await page.locator(sel).first().getAttribute('href').catch(() => null);
    if (!href) break;
    url = new URL(href, url).toString();
  }
  return url;
};

/** 고르기 상자에서 글자가 맞는 첫 항목의 값을 찾아 주소에 붙인다(없으면 기본 주소). 시드한 학교급·학생을 고를 때 쓴다 */
const pickOption = (start, select, text, build) => async ({ page, BASE }) => {
  await page.goto(`${BASE}${start}`, { waitUntil: 'networkidle' });
  const value = await page.locator(`${select} option`, { hasText: text }).first().getAttribute('value').catch(() => null);
  return `${BASE}${value ? build(value) : start}`;
};

export const PAGES = {
  intro: { states: { default: '/intro' } },
  login: { states: { default: '/login' } },
  home: { login: 'admin-a', states: { default: '/home' } },
  intake: { login: 'admin-a', states: { default: '/intake', chat: '/intake?chat=1' } },
  review: { login: 'admin-a', states: { default: '/review', rules: '/review?box=rules' } },
  documents: { login: 'admin-a', states: { default: '/documents' } },
  packages: { login: 'admin-a', states: { default: '/packages' } },
  academics: { login: 'admin-a', states: { default: '/academics', terms: '/academics?tab=terms', years: '/academics?tab=years' } },
  'academic-templates': { login: 'admin-a', states: { default: '/academics/templates' } },
  people: { login: 'admin-a', states: { default: '/people' } },
  // filled·offering: `npm run ui:seed` 뒤에만 채워진다(없으면 목록 그대로 찍힘)
  courses: { login: 'admin-a', states: { default: '/courses', offering: follow('/courses', ['table a[href*="o="]']) } },
  grades: { login: 'admin-a', states: { empty: '/grades', offering: follow('/courses', ['table a[href*="o="]', '[data-testid=to-grades]']) } },
  // seeded: ui:seed의 3월 출결(학교급 '중학교(점검)', 2026-03-03)
  attendance: { login: 'admin-a', states: { default: '/attendance', seeded: pickOption('/attendance?day=2026-03-03', 'select[name=level]', '점검', (v) => `/attendance?day=2026-03-03&level=${v}&from=2026-03-02&to=2026-03-14`) } },
  records: { login: 'admin-a', states: { empty: '/records', person: pickOption('/records', 'select[name=p]', '점검 학생 1', (v) => `/records?p=${v}`) } },
  site: { login: 'admin-a', states: { default: '/site', settings: '/site?box=settings' } },
  'site-inquiries': { login: 'admin-a', states: { empty: '/site/inquiries' } },
  'template-live': { login: 'admin-a', states: { play: '/templates/kinder', ivory: '/templates/story', 'play-inner': '/templates/kinder?page=daily', clear: '/templates/notice', bold: '/templates/admissions', studio: '/templates/project', lamp: '/templates/mission', horizon: '/templates/international', seed: '/templates/single', } },
  'template-story': { login: 'admin-a', states: Object.fromEntries(['home', 'philosophy', 'learning', 'community'].map((p) => [p, `/templates/story?page=${p}`])) },
  'template-project': { login: 'admin-a', states: Object.fromEntries(['home', 'how-we-learn', 'projects', 'works'].map((p) => [p, `/templates/project?page=${p}`])) },
  'template-kinder': { login: 'admin-a', states: Object.fromEntries(['home', 'classes', 'daily', 'admission'].map((p) => [p, `/templates/kinder?page=${p}`])) },
  'site-templates': { login: 'admin-a', states: { default: '/site/templates', story: '/site/templates/story', international: '/site/templates/international' } },
  settings: { login: 'admin-a', states: { default: '/settings' } },
  requests: { login: 'admin-a', states: { default: '/requests' } },
  lab: { login: 'platform', states: { default: '/admin/lab', detail: firstLink('/admin/lab', '[data-testid=lab-items] a.item-title') } },
  control: { login: 'platform', states: { default: '/admin/control' } },
  baseline: { login: 'platform', states: { default: '/admin/baseline' } },
  admin: { login: 'platform', states: { default: '/admin' } },
  usage: { login: 'platform', states: { default: '/admin/usage' } },
  integrations: { login: 'platform', states: { default: '/admin/integrations' } },
  design: { login: 'platform', states: { default: '/admin/design' } },
};
