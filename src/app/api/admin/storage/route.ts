import { handlePlatform } from '@/lib/api';
import { checkStorage, clearDbCopies, copyToStorage, storageStatus } from '@/lib/usage';
import { ValidationError } from '@/lib/services';

/** 저장소 상태(전체 관리자) */
export async function GET(req: Request) {
  return handlePlatform(req, async () => storageStatus());
}

/** {action: 'check'} 연결 확인 · {action: 'copy'} DB 파일을 R2로 25개씩 복사(DB 사본 유지) · {action: 'clear-db'} R2 내용이 같은 것만 DB 사본 비우기(125차) */
export async function POST(req: Request) {
  return handlePlatform(req, async ({ db }) => {
    const body = await req.json().catch(() => ({})) as { action?: string };
    if (body.action === 'check') return checkStorage();
    if (body.action === 'copy') return copyToStorage(db);
    if (body.action === 'clear-db') return clearDbCopies(db);
    throw new ValidationError('err.notAllowed');
  });
}
