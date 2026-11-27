'use client';
import { useId, useState } from 'react';
import { SectionHead } from './SectionHead';

type Lang = 'ko' | 'en' | 'th';
const L = {
  kind: { ko: '신청 종류', en: 'Type', th: 'ประเภท' },
  visit: { ko: '학교 방문', en: 'School visit', th: 'เยี่ยมชมโรงเรียน' }, consult: { ko: '입학 상담', en: 'Admissions', th: 'ปรึกษาการรับสมัคร' }, question: { ko: '문의', en: 'Question', th: 'สอบถาม' },
  name: { ko: '이름', en: 'Name', th: 'ชื่อ' }, contact: { ko: '연락처(전화 또는 이메일)', en: 'Phone or email', th: 'โทรศัพท์หรืออีเมล' },
  date: { ko: '희망 날짜(선택)', en: 'Preferred date (optional)', th: 'วันที่สะดวก (ไม่บังคับ)' }, message: { ko: '남길 말(선택)', en: 'Message (optional)', th: 'ข้อความ (ไม่บังคับ)' },
  consent: { ko: '학교가 답하기 위해 이름·연락처를 받는 데 동의합니다. 학교 관리자만 보고, 1년이 지나면 가려질 수 있습니다.', en: 'I agree that the school collects my name and contact to reply. Only school admins see it; it may be redacted after a year.', th: 'ยินยอมให้โรงเรียนเก็บชื่อและช่องทางติดต่อเพื่อตอบกลับ เฉพาะผู้ดูแลโรงเรียนเห็น และอาจถูกปิดบังหลังหนึ่งปี' },
  send: { ko: '신청 보내기', en: 'Send', th: 'ส่ง' }, sending: { ko: '보내는 중…', en: 'Sending…', th: 'กำลังส่ง…' },
  done: { ko: '신청을 받았습니다. 학교가 연락드리겠습니다.', en: 'Thank you. The school will contact you.', th: 'ได้รับแล้ว โรงเรียนจะติดต่อกลับ' },
  preview: { ko: '미리보기입니다. 실제로 보내지지 않습니다.', en: 'Preview only. Nothing is sent.', th: 'ตัวอย่างเท่านั้น ไม่มีการส่งจริง' },
  website: { ko: '이 칸은 비워 두세요', en: 'Leave this empty', th: 'เว้นว่างไว้' },
} as const;

/**
 * 91차(ADR 0036): 방문·상담 신청 칸. slug가 없으면(템플릿 미리보기) 보내지 않고 안내만 한다.
 * 사람에게 안 보이는 website 칸은 자동 입력을 걸러 낸다.
 */
export function InquiryForm({ slug, lang, page, title, body }: { slug: string | null; lang: Lang; page: string; title?: string; body?: string }) {
  const id = useId();
  const t = (k: keyof typeof L) => L[k][lang];
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slug) return setMsg({ ok: true, text: t('preview') });
    const f = new FormData(e.currentTarget);
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/site/inquiry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        slug, page, lang, kind: f.get('kind'), name: f.get('name'), contact: f.get('contact'), preferred_date: f.get('preferred_date') || null,
        message: f.get('message'), consent: f.get('consent') === 'on', website: f.get('website'),
      }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ ok: false, text: data.error ?? '보내지 못했습니다.' });
      else { setMsg({ ok: true, text: t('done') }); e.currentTarget?.reset(); }
    } catch { setMsg({ ok: false, text: '보내지 못했습니다.' }); }
    finally { setBusy(false); }
  }
  return (
    <section className="sec site-inquiry" data-testid="site-inquiry" aria-labelledby={`${id}-h`}>
      <SectionHead heading={<h2 className="site-h2" id={`${id}-h`}>{title || t('send')}</h2>}
        body={body && <p>{body}</p>} />
      <form className="site-inquiry-form" onSubmit={send}>
        <fieldset><legend>{t('kind')}</legend>
          <div className="site-inquiry-kinds">{(['visit', 'consult', 'question'] as const).map((k, i) => (
            <label key={k}><input type="radio" name="kind" value={k} defaultChecked={i === 0} /> {t(k)}</label>))}</div>
        </fieldset>
        <label>{t('name')}<input name="name" required maxLength={80} autoComplete="name" /></label>
        <label>{t('contact')}<input name="contact" required minLength={3} maxLength={120} autoComplete="email" /></label>
        <label>{t('date')}<input name="preferred_date" type="date" /></label>
        <label>{t('message')}<textarea name="message" rows={3} maxLength={2000} /></label>
        <label className="site-inquiry-trap" aria-hidden="true">{t('website')}<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <label className="site-inquiry-consent"><input type="checkbox" name="consent" required /> {t('consent')}</label>
        <button type="submit" className="site-button" disabled={busy} data-testid="site-inquiry-send">{busy ? t('sending') : t('send')}</button>
        {msg && <p className={msg.ok ? 'site-inquiry-ok' : 'site-inquiry-error'} role="status">{msg.text}</p>}
      </form>
    </section>
  );
}
