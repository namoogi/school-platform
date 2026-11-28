// UI 점검 4-2 기계 검사 중 '디자인 토큰 밖 색상값·임의 px'(docs/UI_REVIEW.md).
// - 색: #hex·rgb()·hsl() 을 토큰 정의 줄(--이름: 값) 밖에서 쓰면 잡는다.
// - px: TSX 의 인라인 style 에 숫자 px 를 쓰면 잡는다(CSS 파일의 px 는 간격 토큰 밖 값이 너무 많아 아직 보지 않음).
// - 지금 있는 것은 기준 목록(scripts/lint-colors.baseline.json)으로 묶고 '새로 생긴 것'만 실패로 본다.
//   (포털 교류의 교훈: 기준선은 개수가 아니라 목록으로 잡는다)
// - 빼는 곳: 디자인 원형 시안 모듈(src/components/archetypes/*.module.css — 시안마다 자기 팔레트, 24차), 테스트.
// 사용: npm run lint:colors            새로 생긴 것이 있으면 종료 코드 1
//       npm run lint:colors -- --update 기준 목록을 지금 상태로 다시 쓴다(줄인 뒤에만 쓴다)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const baselineFile = path.join(root, 'scripts', 'lint-colors.baseline.json');
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;
const INLINE_PX = /style=\{\{[^}]*?\b\d+(?:\.\d+)?px/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

const found = [];
for (const file of walk(path.join(root, 'src'))) {
  const rel = path.relative(root, file).replaceAll(path.sep, '/');
  if (rel.startsWith('src/components/archetypes/') || /\.test\.tsx?$/.test(rel)) continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    // 토큰 정의 줄(--이름: 값;)은 색을 정하는 자리라 허용. 한 줄에 여러 정의가 있어도 모두 --이름: 형태면 허용
    const withoutTokens = t.replace(/--[\w-]+\s*:\s*[^;]+;?/g, '');
    if (COLOR.test(withoutTokens)) found.push({ key: `${rel}: ${t.slice(0, 160)}`, where: `${rel}:${i + 1}`, kind: '색' });
    if (rel.endsWith('.tsx') && INLINE_PX.test(t)) found.push({ key: `${rel}: ${t.slice(0, 160)}`, where: `${rel}:${i + 1}`, kind: '인라인 px' });
  });
}

if (process.argv.includes('--update')) {
  const list = [...new Set(found.map((f) => f.key))].sort();
  fs.writeFileSync(baselineFile, JSON.stringify({ note: '토큰 밖 색·인라인 px 기준 목록. 줄이기만 하고 늘리지 않는다(docs/UI_REVIEW.md 4-2).', items: list }, null, 2) + '\n');
  console.log(`기준 목록을 ${list.length}개로 다시 썼습니다.`);
  process.exit(0);
}
const base = fs.existsSync(baselineFile) ? new Set(JSON.parse(fs.readFileSync(baselineFile, 'utf8')).items) : new Set();
const fresh = found.filter((f) => !base.has(f.key));
const gone = [...base].filter((k) => !found.some((f) => f.key === k));
if (gone.length) console.log(`기준 목록에서 사라진 것 ${gone.length}개 — 줄었으면 'npm run lint:colors -- --update' 로 목록을 줄이세요.`);
if (fresh.length) {
  console.error(`토큰 밖 값이 새로 생겼습니다(${fresh.length}개). 의미 토큰(var(--…))을 쓰세요. docs/design/DESIGN-SYSTEM.md`);
  for (const f of fresh) console.error(`  [${f.kind}] ${f.where}  ${f.key.split(': ').slice(1).join(': ')}`);
  process.exit(1);
}
console.log(`색상·px 린트 통과 (기준 목록 ${base.size}개, 새로 생긴 것 0)`);
