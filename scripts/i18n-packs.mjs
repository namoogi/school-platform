// ADR 0037: 기본 번역 묶음(i18n/<언어>.json)을 DB 번역 사전(ui_messages)에 넣는다.
// 빈 칸만 채운다(이미 있는 번역은 덮지 않음 → 관리 화면·학교 AI가 고친 번역이 배포 때 되돌아가지 않는다).
// 언어 목록(languages)에 없는 언어 파일은 건너뛴다(언어를 켜는 것은 관리 화면 몫).
import fs from 'node:fs';
import path from 'node:path';

export async function applyPacks(client, dir = path.resolve(import.meta.dirname, '..', 'i18n'), log = console.log) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const lang = file.replace(/\.json$/, '');
    const { rowCount } = await client.query('select 1 from public.languages where code = $1', [lang]);
    if (!rowCount) { log(`[i18n] ${lang}: 언어 목록에 없어 건너뜀`); continue; }
    const messages = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const { rowCount: n } = await client.query(
      `insert into public.ui_messages(lang, key, text)
       select $1, k, v from jsonb_each_text($2::jsonb) as e(k, v) where btrim(v) <> ''
       on conflict (lang, key) do nothing`, [lang, JSON.stringify(messages)]);
    total += n;
    log(`[i18n] ${lang}: 새 번역 ${n}개(이미 있는 번역은 그대로)`);
  }
  return total;
}
