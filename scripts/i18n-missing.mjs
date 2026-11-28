// 번역 묶음(i18n/<언어>.json)에 빠진 이름표를 찾고 채운다(ADR 0037).
// 사용:
//   node scripts/i18n-missing.mjs                 언어별 빠진 개수
//   node scripts/i18n-missing.mjs th > todo.json  th 에 빠진 이름표를 {이름표: {ko, en}} 로 뽑는다(번역할 거리)
//   node scripts/i18n-missing.mjs th --apply done.json   {이름표: 번역} 을 th 묶음에 넣는다(이름표 순서는 en 을 따른다)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'i18n');
const en = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));
const catalogSrc = fs.readFileSync(path.join(root, 'src', 'lib', 'i18n', 'catalog.ts'), 'utf8');
const ko = (k) => { const m = catalogSrc.match(new RegExp(`^\\s*'${k.replace(/\./g, '\\.')}': '((?:[^'\\\\]|\\\\.)*)',$`, 'm')); return m ? m[1].replace(/\\'/g, "'").replace(/\\n/g, '\n') : ''; };
const packs = fs.readdirSync(dir).filter((f) => /^[\w-]+\.json$/.test(f) && f !== 'en.json').map((f) => f.slice(0, -5));
const [lang, flag, file] = process.argv.slice(2);

if (!lang) {
  for (const l of packs) { const p = JSON.parse(fs.readFileSync(path.join(dir, `${l}.json`), 'utf8')); console.log(`${l}: 빠진 이름표 ${Object.keys(en).filter((k) => !(k in p)).length}개`); }
  process.exit(0);
}
const packFile = path.join(dir, `${lang}.json`);
const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
if (flag === '--apply') {
  const add = JSON.parse(fs.readFileSync(file, 'utf8'));
  const merged = { ...pack, ...add };
  const out = Object.fromEntries(Object.keys(en).filter((k) => k in merged).map((k) => [k, merged[k]]));
  fs.writeFileSync(packFile, JSON.stringify(out, null, 2) + '\n');
  console.error(`${lang}: ${Object.keys(add).length}개 넣음, 빠진 이름표 ${Object.keys(en).filter((k) => !(k in out)).length}개 남음`);
} else {
  console.log(JSON.stringify(Object.fromEntries(Object.keys(en).filter((k) => !(k in pack)).map((k) => [k, { ko: ko(k), en: en[k] }])), null, 1));
}
