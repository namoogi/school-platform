import { handle } from '@/lib/api';
import { addFiles, listSources, ValidationError } from '@/lib/services';

export async function GET(req: Request) {
  return handle(req, ({ db, school }) => listSources(db, school.id));
}

/** 여러 파일을 multipart로 받는다. (필드 이름: files) */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const form = await req.formData().catch(() => { throw new ValidationError('파일 형식의 요청이 아닙니다.'); });
    const files = form.getAll('files').filter((f): f is File => typeof f === 'object' && 'arrayBuffer' in f);
    const incoming = await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, bytes: Buffer.from(await f.arrayBuffer()) })));
    return addFiles(db, school.id, incoming);
  });
}
