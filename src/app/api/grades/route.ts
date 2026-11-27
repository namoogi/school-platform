import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { addAssessment, archiveAssessment, closeOffering, type GradingPolicy, recordNarrative, recordResult, saveGradingPolicy, saveScalePreset, SCALE_PRESETS } from '@/lib/grading';
import { latestPolicy } from '@/lib/gradebook';

/**
 * 73차: 성적(척도·정책 판·평가 항목·결과·서술·수업 마감 판). 권한(관리자·담당 교사)·마감 뒤 정정·판 충돌은 DB 명령 함수가 판정한다.
 * body.action: scale-preset | policy | assessment | archive-assessment | results | narrative | close
 */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('err.badRequest'); });
    switch (b?.action) {
      case 'scale-preset': {
        if (!Object.hasOwn(SCALE_PRESETS, b.preset)) throw new ValidationError('err.grade.unknownScale');
        return await saveScalePreset(db, school.id, b.preset);
      }
      case 'policy': {
        // 화면에서 다루지 않는 칸(GPA·석차·서술 한도 등)은 최신 판 값을 그대로 잇는다
        const prev = ((await latestPolicy(db, school.id))?.policy ?? {}) as GradingPolicy;
        const digits = (v: unknown, d: number) => { const n = Number(v ?? d); if (!Number.isInteger(n) || n < 0 || n > 4) throw new ValidationError('err.grade.digits'); return n; };
        return { version: await saveGradingPolicy(db, school.id, {
          ...prev, score_digits: digits(b.score_digits, 2), final_digits: digits(b.final_digits, 0),
          stats: { ...(prev.stats ?? {}), sd: b.sd === 'sample' ? 'sample' : 'population' },
        }, { why: b.why, base_version: b.base_version }) };
      }
      case 'assessment': return { id: await addAssessment(db, school.id, b.offeringId, {
        code: b.code, title: { ko: String(b.title ?? '') }, kind: b.kind || 'exam', axis: 'course', weight: b.weight, maxScore: b.maxScore,
      }) };
      case 'archive-assessment': await archiveAssessment(db, school.id, b.assessmentId); return { ok: true };
      case 'results': {
        if (!Array.isArray(b.entries) || !b.entries.length || b.entries.length > 2000) throw new ValidationError('err.grade.noCells');
        for (const e of b.entries) await recordResult(db, school.id, e?.assessmentId, e?.personId, { score: e?.score, reason: b.reason });
        return { saved: b.entries.length };
      }
      case 'narrative': return { id: await recordNarrative(db, school.id, {
        personId: b.personId, offeringId: b.offeringId, academicYearId: b.academicYearId, termId: b.termId, kind: b.kind || 'subject_detail', authorRole: 'teacher', body: b.body, reason: b.reason,
      }) };
      case 'close': return await closeOffering(db, school.id, b.offeringId, { base_version: b.base_version, reason: b.reason, requestKey: b.requestKey, scaleId: b.scaleId || null });
      default: throw new ValidationError('err.unknownAction');
    }
  }, { module: 'records' });
}
