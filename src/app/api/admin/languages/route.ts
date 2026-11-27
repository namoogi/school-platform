import { handlePlatform } from '@/lib/api';
import { exportMessages, listLanguages, saveLanguage, saveMessages } from '@/lib/languages';
import { ValidationError } from '@/lib/services';

/** ADR 0037: 언어·번역 관리(전체 관리자). GET ?export=<lang> 은 번역 내보내기 */
export async function GET(req: Request) {
  const lang = new URL(req.url).searchParams.get('export');
  return handlePlatform(req, async ({ db }) => (lang ? exportMessages(db, lang) : listLanguages(db)));
}

/** { action: 'language', ...언어 } | { action: 'messages', lang, messages, overwrite } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handlePlatform(req, async ({ db }) => {
    if (body?.action === 'language') return saveLanguage(db, body);
    if (body?.action === 'messages') return saveMessages(db, body.lang, body.messages, body.overwrite);
    throw new ValidationError('err.unknownRequest');
  });
}
