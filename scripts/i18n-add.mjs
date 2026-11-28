// ADR 0037: 화면 문구 이름표를 catalog.ts(한국어 기준)와 i18n/<언어>.json(번역 묶음 전부)에 한 번에 더한다.
// 화면을 옮길 때 파일들이 어긋나지 않게 하는 도구다(시험 tests/i18n-format.test.ts 가 이름표·채우기 자리 일치와 묶음이 빠짐없는지를 본다).
// 사용: node scripts/i18n-add.mjs <묶음.json>
//   묶음.json = { "section": "공통 부품", "entries": [["영역.이름", "한국어", "English", "ไทย"], ...] }
//   - 한국어 뒤의 칸 순서는 영어(en) 먼저, 그다음 i18n/ 의 다른 묶음을 이름순(지금은 th). 칸 순서는 실행할 때 화면에 찍힌다.
//   - 묶음이 있는 언어는 모두 채워야 한다(빠지면 아무것도 쓰지 않고 멈춘다). 새 문구도 태국어 등 모든 묶음에 함께 들어간다(사용자 결정 2026-11-28).
// - 이미 있는 이름표는 건너뛰고 알린다(문구를 바꾸려면 파일을 직접 고친다).
// - 채우기 자리({name}, {n, plural, …})가 한국어와 다르면 아무것도 쓰지 않고 멈춘다.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const catalogFile = path.join(root, 'src', 'lib', 'i18n', 'catalog.ts');
const packDir = path.join(root, 'i18n');
const packs = ['en', ...fs.readdirSync(packDir).filter((f) => /^[\w-]+\.json$/.test(f)).map((f) => f.slice(0, -5)).filter((l) => l !== 'en').sort()];

const input = process.argv[2];
if (!input) { console.error(`사용: node scripts/i18n-add.mjs <묶음.json>\n  entries 칸: [이름표, 한국어, ${packs.join(', ')}]`); process.exit(2); }
const { section, entries } = JSON.parse(fs.readFileSync(input, 'utf8'));

const short = entries.filter((e) => e.length < 2 + packs.length || e.slice(2, 2 + packs.length).some((v) => typeof v !== 'string' || !v.trim()));
if (short.length) { console.error(`모든 묶음(${packs.join(', ')})의 번역이 필요합니다. 칸 순서: [이름표, 한국어, ${packs.join(', ')}]\n빠진 이름표: ${short.map((e) => e[0]).join(', ')}`); process.exit(1); }
const holes = (s) => [...s.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]).sort().join(',');
const bad = entries.filter(([, ko, ...tr]) => tr.slice(0, packs.length).some((t) => holes(t) !== holes(ko)));
if (bad.length) { console.error('채우기 자리가 한국어와 다릅니다:', bad.map((b) => b[0]).join(', ')); process.exit(1); }
const badKey = entries.filter(([k]) => !/^[a-zA-Z][\w]*(\.[\w]+)+$/.test(k));
if (badKey.length) { console.error('이름표는 영역.이름 꼴이어야 합니다:', badKey.map((b) => b[0]).join(', ')); process.exit(1); }

let catalog = fs.readFileSync(catalogFile, 'utf8');
const en = JSON.parse(fs.readFileSync(path.join(packDir, 'en.json'), 'utf8'));
const seen = new Set();
const fresh = entries.filter(([k]) => {
  if (k in en || catalog.includes(`'${k}':`) || seen.has(k)) { console.log(`건너뜀(이미 있음): ${k}`); return false; }
  seen.add(k); return true;
});
if (!fresh.length) { console.log('더할 이름표가 없습니다.'); process.exit(0); }

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const block = `  // ${section}\n` + fresh.map(([k, ko]) => `  ${q(k)}: ${q(ko)},\n`).join('');
const end = catalog.lastIndexOf('} as const;');
catalog = catalog.slice(0, end) + block + catalog.slice(end);

// 묶음 파일은 다 쓴 뒤에 한꺼번에 저장한다(하나라도 깨지면 아무것도 바뀌지 않게)
const writes = packs.map((lang, i) => {
  const file = path.join(packDir, `${lang}.json`);
  let text = fs.readFileSync(file, 'utf8').replace(/\s*\}\s*$/, '');
  text += ',\n' + fresh.map((e) => `  ${JSON.stringify(e[0])}: ${JSON.stringify(e[2 + i])}`).join(',\n') + '\n}\n';
  JSON.parse(text); // 깨진 JSON 이면 여기서 멈춘다
  return [file, text];
});
fs.writeFileSync(catalogFile, catalog);
for (const [file, text] of writes) fs.writeFileSync(file, text);
console.log(`이름표 ${fresh.length}개를 더했습니다(${section}, 묶음: ${packs.join(', ')}).`);
