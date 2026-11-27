// ADR 0037: 화면 코드(TSX)에 새로 박히는 한국어 문구를 막는다. 화면 문구는 사전(src/lib/i18n/catalog.ts + t())으로 쓴다.
// - 주석을 빼고, 한글이 든 줄 수를 파일마다 센다. 지금 있는 것은 기준선(scripts/lint-i18n.baseline.json)으로 묶는다.
// - 파일의 줄 수가 기준선보다 늘거나, 기준선에 없는 새 파일에 한글 줄이 있으면 실패. 줄어든 것은 --update 로 기준선을 낮춘다.
// - 빼는 곳: 디자인 원형 시안, 공개 홈페이지 렌더러(학교 내용은 학교 언어 칸으로 따로 다룸), 테스트.
// 사용: npm run lint:i18n            늘어난 곳이 있으면 종료 코드 1
//       npm run lint:i18n -- --update 기준선을 지금 상태로 다시 쓴다(줄인 뒤에만)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const baselineFile = path.join(root, 'scripts', 'lint-i18n.baseline.json');
const HANGUL = /[가-힣]/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const counts = {};
for (const file of [...walk(path.join(root, 'src', 'app')), ...walk(path.join(root, 'src', 'components'))]) {
  const rel = path.relative(root, file).replaceAll(path.sep, '/');
  if (rel.startsWith('src/components/archetypes/') || rel.startsWith('src/components/site/') || rel.startsWith('src/app/s/')) continue;
  const n = stripComments(fs.readFileSync(file, 'utf8')).split('\n').filter((l) => HANGUL.test(l)).length;
  if (n) counts[rel] = n;
}

if (process.argv.includes('--update')) {
  fs.writeFileSync(baselineFile, JSON.stringify(Object.fromEntries(Object.entries(counts).sort()), null, 2) + '\n');
  console.log(`기준선을 다시 썼습니다: 파일 ${Object.keys(counts).length}개, 한글 줄 ${Object.values(counts).reduce((a, b) => a + b, 0)}줄`);
  process.exit(0);
}
const base = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : {};
const grew = Object.entries(counts).filter(([f, n]) => n > (base[f] ?? 0));
const shrank = Object.entries(base).filter(([f, n]) => (counts[f] ?? 0) < n);
const total = Object.values(counts).reduce((a, b) => a + b, 0);
if (grew.length) {
  console.error('화면 코드에 한국어 문구가 늘었습니다. 문구는 src/lib/i18n/catalog.ts 에 이름표로 두고 t() 로 쓰세요(ADR 0037):');
  for (const [f, n] of grew) console.error(`  ${f}: ${base[f] ?? 0} → ${n}줄`);
  process.exit(1);
}
console.log(`화면 문구 검사 통과: 남은 한글 줄 ${total}줄(파일 ${Object.keys(counts).length}개)` + (shrank.length ? ` · 줄어든 파일 ${shrank.length}개 — npm run lint:i18n -- --update 로 기준선을 낮추세요` : ''));
