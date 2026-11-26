import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { closeRecordYear, publishRecordDocument, recordDisclosure, type Format } from '@/lib/records';
import { addExternalResult, awardQualification, closeCountReport } from '@/lib/qualifications';

/**
 * 75차: 기록(학년도 기록 마감 판·발행·공개 기록·외부 결과·자격·지정일 보고). 모두 학교 관리자 일이고, 판정은 DB 명령 함수가 한다.
 * 발행본은 마감 판 스냅샷만으로 그린다(지침 5). body.action: close-year | publish | disclose | external | qualification | count-report
 */
const FORMATS: Format[] = ['kr_alt_record', 'us_transcript', 'us_school_profile', 'th_por_por_1', 'en_record'];
const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    switch (b?.action) {
      case 'close-year': {
        const base = Number(b.bases?.[b.yearId] ?? 0);
        return await closeRecordYear(db, school.id, b.personId, b.yearId, { base_version: base, reason: txt(b.reason), requestKey: b.requestKey });
      }
      case 'publish': {
        if (!FORMATS.includes(b.format)) throw new ValidationError('알 수 없는 발행 형식입니다.');
        const r = await publishRecordDocument(db, school.id, { format: b.format, personId: b.format === 'us_school_profile' ? undefined : b.personId, blind: b.blind === 'yes' });
        return { id: r.id, issues: r.issues.length };
      }
      case 'disclose': return { id: await recordDisclosure(db, school.id, { documentId: b.documentId, recipient: txt(b.recipient), purpose: txt(b.purpose), basis: txt(b.basis) || undefined }) };
      case 'external': {
        const score = b.score === '' || b.score == null ? undefined : Number(b.score);
        if (score !== undefined && !Number.isFinite(score)) throw new ValidationError('점수는 숫자입니다.');
        return { id: await addExternalResult(db, school.id, {
          personId: b.personId, issuer: txt(b.issuer), exam: txt(b.exam), title: txt(b.title) ? { en: txt(b.title) } : {}, satOn: txt(b.satOn),
          result: { ...(txt(b.grade) ? { grade: txt(b.grade) } : {}), ...(score !== undefined ? { score } : {}) }, source: txt(b.source) || undefined,
          correctsId: txt(b.correctsId) || undefined, reason: txt(b.reason) || undefined,
        }) };
      }
      case 'qualification': {
        const min = b.minCredits === '' || b.minCredits == null ? undefined : Number(b.minCredits);
        return { id: await awardQualification(db, school.id, {
          personId: b.personId, kind: txt(b.kind), title: { ko: txt(b.title) }, awardedOn: txt(b.awardedOn) || undefined,
          requirements: min !== undefined && Number.isFinite(min) ? { min_credits: min } : {},
        }) };
      }
      case 'count-report': return await closeCountReport(db, school.id, {
        code: txt(b.code), asOf: txt(b.asOf), base_version: Number(b.bases?.[txt(b.code)] ?? 0), reason: txt(b.reason) || undefined, requestKey: String(b.requestKey ?? ''),
      });
      default: throw new ValidationError('알 수 없는 작업입니다.');
    }
  }, { module: 'records' });
}
