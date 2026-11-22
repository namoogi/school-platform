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

// 3. 비밀 값처럼 보이는 문자열 (코드·문서)
const secretPatterns = [
  /sb_secret_[A-Za-z0-9_-]{10,}/, /service_role["'\s:=]+ey[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^\s:@/]+:(?!\[)[^\s@/\[\]<>]{6,}@[^\s]*supabase\.co/, /sk-ant-[A-Za-z0-9_-]{20,}/,
];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git', 'school-platform-handoff', 'test-results'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs|js|json|md|sql|yml|yaml|css)$/.test(e.name)) {
      const text = fs.readFileSync(p, 'utf8');
      for (const re of secretPatterns) if (re.test(text)) problems.push(`비밀 값으로 보이는 문자열: ${path.relative(root, p)}`);
    }
  }
}
walk(root);

if (problems.length) {
  console.error('저장소 점검 실패:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(`저장소 점검 통과 (마이그레이션 ${migs.length}개, 결정 기록 ${adrSeen.size}개)`);
