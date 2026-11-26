import { handlePlatform } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { collectSchoolReports, publishBaseline } from '@/lib/baseline';

/** 76차: 관제 기본판 새 판 내기·보고 모으기(ADR 0027). 전체 관리자만(handlePlatform + DB 함수) */
export async function POST(req: Request) {
  return handlePlatform(req, async ({ db }) => {
    const b = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    switch (b?.action) {
      case 'publish': {
        let manifest: unknown;
        try { manifest = JSON.parse(String(b.manifest ?? '')); } catch { throw new ValidationError('기본판 내용이 올바른 JSON이 아닙니다.'); }
        return { version: await publishBaseline(db, { title: b.title, manifest, why: b.why, base_version: b.base_version }) };
      }
      case 'collect': return { collected: await collectSchoolReports(db) };
      default: throw new ValidationError('알 수 없는 작업입니다.');
    }
  });
}
