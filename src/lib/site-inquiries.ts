import type { Db } from './db';
import { isUuid, ValidationError } from './services';

/**
 * 91차(ADR 0036): 학교 홈페이지 방문·상담 신청.
 * - 방문자 제출은 asVisitor 트랜잭션에서 app.submit_site_inquiry 로만 한다(열린 홈페이지 + 신청 받기 + 동의 + 횟수 제한은 DB가 검사).
 * - 읽기·처리·가리기는 학교 관리자(RLS: is_member + is_school_admin). 학교 ID는 로그인 소속에서 정한다.
 */
export const INQUIRY_KINDS = ['visit', 'consult', 'question'] as const;
export type InquiryKind = (typeof INQUIRY_KINDS)[number];
export const INQUIRY_KIND_LABEL: Record<InquiryKind, string> = { visit: '학교 방문', consult: '입학 상담', question: '문의' };
export type Inquiry = {
  id: string; kind: InquiryKind; name: string; contact: string; preferred_date: string | null; message: string | null;
  lang: string; page: string | null; status: 'new' | 'done'; created_at: string; handled_at: string | null; redacted_at: string | null;
};

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max + 1) : '');

/** 방문자 입력 검사(DB 제약과 같은 길이). 오류 문구에 입력값을 넣지 않는다 */
export function parseInquiry(b: Record<string, unknown>) {
  const kind = INQUIRY_KINDS.includes(b.kind as InquiryKind) ? (b.kind as InquiryKind) : null;
  if (!kind) throw new ValidationError('신청 종류를 고르세요.');
  const name = str(b.name, 80), contact = str(b.contact, 120), message = str(b.message, 2000), page = str(b.page, 200);
  if (!name || name.length > 80) throw new ValidationError('이름을 80자 안으로 적어 주세요.');
  if (contact.length < 3 || contact.length > 120) throw new ValidationError('연락받을 전화나 이메일을 적어 주세요.');
  if (message.length > 2000) throw new ValidationError('내용은 2000자까지 적을 수 있습니다.');
  const date = typeof b.preferred_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.preferred_date) ? b.preferred_date : null;
  const lang = b.lang === 'en' || b.lang === 'th' ? b.lang : 'ko';
  if (b.consent !== true) throw new ValidationError('개인정보 수집·이용에 동의해 주세요.');
  return { kind, name, contact, message: message || null, page: page || null, date, lang, consent: true as const };
}

export async function submitInquiry(db: Db, slug: string, input: ReturnType<typeof parseInquiry>) {
  try {
    await db.query('select app.submit_site_inquiry($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [slug, input.kind, input.name, input.contact, input.date, input.message, input.lang, input.page, input.consent]);
  } catch (e) {
    const m = (e as { message?: string; code?: string });
    if (m.message === 'inquiry_closed') throw new ValidationError('지금은 이 학교 홈페이지에서 신청을 받지 않습니다.');
    if (m.message === 'consent_required') throw new ValidationError('개인정보 수집·이용에 동의해 주세요.');
    if (m.message === 'too_many') throw new ValidationError('신청이 많아 잠시 받을 수 없습니다. 나중에 다시 하거나 학교로 연락해 주세요.');
    if (m.code === '23514') throw new ValidationError('입력한 내용의 길이나 형식을 확인해 주세요.');
    throw e;
  }
  return { ok: true };
}

export async function listInquiries(db: Db, schoolId: string): Promise<Inquiry[]> {
  const { rows } = await db.query<Inquiry>(
    `select id, kind, name, contact, preferred_date::text, message, lang, page, status, created_at, handled_at, redacted_at
       from public.site_inquiries where school_id = $1 order by created_at desc limit 500`, [schoolId]);
  return rows;
}

export async function setInquiryStatus(db: Db, schoolId: string, userId: string, id: string, status: unknown) {
  if (!isUuid(id)) throw new ValidationError('신청을 찾을 수 없습니다.');
  if (status !== 'new' && status !== 'done') throw new ValidationError('처리 상태가 올바르지 않습니다.');
  const { rowCount } = await db.query(
    `update public.site_inquiries set status = $3, handled_at = case when $3 = 'done' then now() else null end, handled_by = case when $3 = 'done' then $4::uuid else null end
      where id = $1 and school_id = $2`, [id, schoolId, status, userId]);
  if (!rowCount) throw new ValidationError('신청을 찾을 수 없습니다.');
  return { ok: true };
}

export async function redactInquiries(db: Db, schoolId: string, keepDays: unknown) {
  const days = Number(keepDays);
  if (!Number.isInteger(days) || days < 30) throw new ValidationError('보존 기간은 30일 이상으로 정해 주세요.');
  const { rows } = await db.query<{ n: number }>('select app.redact_site_inquiries($1, $2) as n', [schoolId, days]);
  return { redacted: rows[0].n };
}
