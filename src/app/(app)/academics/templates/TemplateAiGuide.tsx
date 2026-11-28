'use client';
import { useState } from 'react';
import { ClipboardCopy } from 'lucide-react';
import { Button, TextArea } from '@radix-ui/themes';
import { useI18n } from '@/components/I18nProvider';
import { copyText } from '@/lib/clipboard';
import { buildTemplateGuideText, GRADE_INTAKE_URL, type GuideInput } from '@/lib/template-ai-guide';

/**
 * 127차: '학교 AI로 우리 학교에 맞추기' — 학교 사본 요약을 담은 지시문을 복사해 학교 구독 AI 대화창에 붙여 넣는다.
 * 주소는 지금 브라우저 주소로 만든다(AI 연결 글과 같음). 토큰은 담지 않는다(발급은 AI 작업 공간).
 */
export function TemplateAiGuide({ summary, schoolName }: { summary: Omit<GuideInput, 'schoolName' | 'baseUrl'>; schoolName: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'copied' | 'fail'>('idle');
  const [open, setOpen] = useState(false);
  const text = () => buildTemplateGuideText({ ...summary, schoolName, baseUrl: window.location.origin });
  return (
    <div className="stack">
      <div className="form-actions">
        {/* ADR 0045: 단추는 Radix. 주 행동(복사)은 solid, 보기는 soft */}
        <Button type="button" data-testid="tpl-ai-copy" onClick={async () => setState((await copyText(text())) ? 'copied' : 'fail')}>
          <ClipboardCopy size={16} aria-hidden="true" />{t('tplAi.copy')}
        </Button>
        <Button type="button" variant="soft" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="tpl-ai-show">
          {open ? t('tplAi.hide') : t('tplAi.show')}
        </Button>
      </div>
      {state !== 'idle' && <p className={state === 'copied' ? 'notice' : 'alert'} role="status">{state === 'copied' ? t('tplAi.copied') : t('tplAi.copyFailed')}</p>}
      {open && <TextArea readOnly rows={14} value={text()} aria-label={t('tplAi.textLabel')} data-testid="tpl-ai-text" onFocus={(e) => e.currentTarget.select()} />}
      <p className="fine"><a href={GRADE_INTAKE_URL} target="_blank" rel="noopener noreferrer">{t('tplAi.docLink')}</a></p>
    </div>
  );
}
