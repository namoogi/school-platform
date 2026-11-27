// 저장소 문지기: 문서·도구만으로는 병렬 세션의 충돌을 막지 못한다(드리미포털 교훈 L4·L7).
// CI와 세션 종료 점검에서 실행한다. 실패하면 0이 아닌 값으로 끝난다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

// 1. 마이그레이션: 이름 형식 YYYYMMDDHHMMSS_슬러그.sql, 앞 번호 겹침 금지
const migDir = path.join(root, 'supabase', 'migrations');
const migs = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql'));
const seen = new Map();
for (const f of migs) {
  const m = /^(\d{14})_[a-z0-9_]+\.sql$/.exec(f);
  if (!m) { problems.push(`마이그레이션 이름 형식: ${f} (YYYYMMDDHHMMSS_slug.sql)`); continue; }
  if (seen.has(m[1])) problems.push(`마이그레이션 번호 겹침: ${f} ↔ ${seen.get(m[1])}`);
  seen.set(m[1], f);
}

// 2. 결정 기록: NNNN-슬러그.md 번호 겹침 금지
const adrDir = path.join(root, 'docs', 'decisions');
const adrSeen = new Map();
for (const f of fs.readdirSync(adrDir).filter((x) => /^\d{4}-/.test(x))) {
  const n = f.slice(0, 4);
  if (adrSeen.has(n)) problems.push(`결정 기록 번호 겹침: ${f} ↔ ${adrSeen.get(n)}`);
  adrSeen.set(n, f);
}

// 3. 비밀 값·개인 연락처 (2026-11-27 저장소 공개 전환 뒤 강화)
//    저장소는 공개다. 커밋 기록까지 누구나 본다. 값은 출력하지 않고 파일·줄만 알린다.
const secretPatterns = [
  ['Supabase 비밀 키', /sb_secret_[A-Za-z0-9_-]{10,}/],
  ['service_role 키', /service_role["'\s:=]+ey[A-Za-z0-9_-]{20,}/],
  ['JWT(서명된 키)', /eyJhbGciOi[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
  ['비밀번호가 든 DB 주소', /postgres(?:ql)?:\/\/[^\s:@/]+:(?!\[)[^\s@/\[\]<>]{6,}@[^\s]*(?:supabase\.(?:co|com)|amazonaws\.com|neon\.tech)/],
  ['Anthropic 키', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI 키', /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ['GitHub 토큰', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ['Google API 키', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['AWS 접근 키', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack 토큰', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['개인 키', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['비밀 이름에 값 대입', /\b[A-Z0-9_]*(?:SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*[=:]\s*['"]?(?![^'"\s]*(?:local|dev|test|example|change-me|dummy|demo|placeholder|<|\$|\.\.\.))[A-Za-z0-9_+/=-]{24,}/],
];
// 개인 메일 주소: 실제 사람 연락처를 코드·문서에 넣지 않는다. 예시는 example.test 등을 쓴다.
const personalMail = /[A-Za-z0-9._%+-]+@(?:gmail|naver|daum|hanmail|kakao|nate|hotmail|outlook|yahoo|icloud)\.(?:com|net)\b/i;
const skipDirs = ['node_modules', '.next', '.git', 'test-results', '.ui-review', '.school-move'];
const scanExt = /\.(ts|tsx|mjs|cjs|js|json|md|sql|yml|yaml|css|html|py|sh|txt|toml|csv|env|example)$/;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.includes(e.name) || e.name.startsWith('.e2e-agent-')) continue;
    const p = path.join(dir, e.name);
    const rel = path.relative(root, p);
    if (e.isDirectory()) { walk(p); continue; }
    if (/^\.env/.test(e.name) && e.name !== '.env.example' && !/\.local$/.test(e.name)) problems.push(`환경 파일은 커밋하지 않습니다: ${rel}`);
    if (!scanExt.test(e.name) && !/^\.env/.test(e.name)) continue;
    if (/\.local$/.test(e.name)) continue; // .gitignore 대상(로컬 비밀)
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const [label, re] of secretPatterns) if (re.test(line)) problems.push(`${label} 의심: ${rel}:${i + 1}`);
      if (!/license/i.test(e.name) && personalMail.test(line)) problems.push(`개인 메일 주소: ${rel}:${i + 1}`);
    });
  }
}
walk(root);

if (problems.length) {
  console.error('저장소 점검 실패:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(`저장소 점검 통과 (마이그레이션 ${migs.length}개, 결정 기록 ${adrSeen.size}개)`);
