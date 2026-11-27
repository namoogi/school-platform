// ADR 0037: 화면 문구 이름표를 catalog.ts(한국어 기준)와 i18n/en.json(영어)에 한 번에 더한다.
// 화면을 옮길 때 두 파일이 어긋나지 않게 하는 도구다(시험 tests/i18n-format.test.ts 가 이름표·채우기 자리 일치를 본다).
// 사용: node scripts/i18n-add.mjs <묶음.json>
//   묶음.json = { "section": "공통 부품", "entries": [["영역.이름", "한국어", "English"], ...] }
// - 이미 있는 이름표는 건너뛰고 알린다(문구를 바꾸려면 두 파일을 직접 고친다).
// - 채우기 자리({name}, {n, plural, …})가 한·영에서 다르면 아무것도 쓰지 않고 멈춘다.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const catalogFile = path.join(root, 'src', 'lib', 'i18n', 'catalog.ts');
const enFile = path.join(root, 'i18n', 'en.json');

const input = process.argv[2];
if (!input) { console.error('사용: node scripts/i18n-add.mjs <묶음.json>'); process.exit(2); }
const { section, entries } = JSON.parse(fs.readFileSync(input, 'utf8'));

const holes = (s) => [...s.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]).sort().join(',');
const bad = entries.filter(([, ko, en]) => holes(ko) !== holes(en));
if (bad.length) { console.error('채우기 자리가 다릅니다:', bad.map((b) => b[0]).join(', ')); process.exit(1); }
const badKey = entries.filter(([k]) => !/^[a-zA-Z][\w]*(\.[\w]+)+$/.test(k));
if (badKey.length) { console.error('이름표는 영역.이름 꼴이어야 합니다:', badKey.map((b) => b[0]).join(', ')); process.exit(1); }

let catalog = fs.readFileSync(catalogFile, 'utf8');
const en = JSON.parse(fs.readFileSync(enFile, 'utf8'));
const seen = new Set();
const fresh = entries.filter(([k]) => {
  if (k in en || catalog.includes(`'${k}':`) || seen.has(k)) { console.log(`건너뜀(이미 있음): ${k}`); return false; }
  seen.add(k); return true;
});
if (!fresh.length) { console.log('더할 이름표가 없습니다.'); process.exit(0); }

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const block = `  // ${section}\n` + fresh.map(([k, ko]) => `  ${q(k)}: ${q(ko)},\n`).join('');
const end = catalog.lastIndexOf('} as const;');
catalog = catalog.slice(0, end) + block + catalog.slice(end);
fs.writeFileSync(catalogFile, catalog);

let enText = fs.readFileSync(enFile, 'utf8').replace(/\s*\}\s*$/, '');
enText += ',\n' + fresh.map(([k, , e]) => `  ${JSON.stringify(k)}: ${JSON.stringify(e)}`).join(',\n') + '\n}\n';
JSON.parse(enText); // 깨진 JSON 이면 여기서 멈춘다
fs.writeFileSync(enFile, enText);
console.log(`이름표 ${fresh.length}개를 더했습니다(${section}).`);
