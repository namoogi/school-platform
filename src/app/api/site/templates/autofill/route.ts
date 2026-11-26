import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { autofillPropose } from '@/lib/site-templates';

/** 66차(ADR 0031): 학교 자료(PDF·DOCX·TXT, 필드 files, 5개·각 8MB까지)로 템플릿 빈 칸 제안. 파일은 저장하지 않는다 */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const form = await req.formData().catch(() => { throw new ValidationError('파일 형식의 요청이 아닙니다.'); });
    const key = String(form.get('key') ?? '');
    const files: { name: string; bytes: Buffer }[] = [];
    for (const f of form.getAll('files')) {
      if (f && typeof f === 'object' && 'arrayBuffer' in f) files.push({ name: f.name, bytes: Buffer.from(await f.arrayBuffer()) });
    }
    return autofillPropose(db, school.id, key, files, school.name);
  }, { module: 'homepage', admin: true });
}
