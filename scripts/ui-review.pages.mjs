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

export const PAGES = {
  intro: { states: { default: '/intro' } },
  login: { states: { default: '/login' } },
  home: { login: 'admin-a', states: { default: '/home' } },
  intake: { login: 'admin-a', states: { default: '/intake', chat: '/intake?chat=1' } },
  review: { login: 'admin-a', states: { default: '/review', rules: '/review?box=rules' } },
  academics: { login: 'admin-a', states: { default: '/academics' } },
  people: { login: 'admin-a', states: { default: '/people' } },
  courses: { login: 'admin-a', states: { default: '/courses' } },
  grades: { login: 'admin-a', states: { empty: '/grades' } },
  attendance: { login: 'admin-a', states: { default: '/attendance' } },
  records: { login: 'admin-a', states: { empty: '/records' } },
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
};
