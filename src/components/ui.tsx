import { Breadcrumb, Steps, type Crumb, type StepItem } from './ui-client';

export { Steps, type Crumb, type StepItem };

/** 공통 컴포넌트. 규칙: docs/design/DESIGN-SYSTEM.md */

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'discovery';

/** 상태 배지: 항상 글자 포함, 클릭 불가 */
export function StatusBadge({ tone = 'neutral', children, dot = false }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  return <span className={`badge${dot ? ' badge-dot' : ''}`} data-tone={tone}>{children}</span>;
}

/** 화면마다 하나. 제목은 h1, 주 동작은 오른쪽에 최대 하나 */
export function PageHeader({ title, description, crumbs, status, meta, actions, children }: {
  title: React.ReactNode; description?: React.ReactNode; crumbs?: Crumb[]; status?: React.ReactNode;
  meta?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      {crumbs && crumbs.length > 0 && (
        <Breadcrumb crumbs={crumbs} />
      )}
      <div className="page-header-row">
        <div className="stack" style={{ gap: 6 }}>
          <div className="page-title"><h1>{title}</h1>{status}</div>
          {meta && <div className="page-meta">{meta}</div>}
          {description && <p className="page-desc">{description}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Banner({ tone = 'info', children, role }: { tone?: Tone; children: React.ReactNode; role?: 'status' | 'alert' }) {
  return <div className="banner" data-tone={tone} role={role}>{children}</div>;
}

export function Kpi({ label, value, tone, hint }: { label: string; value: React.ReactNode; tone?: Tone; hint?: React.ReactNode }) {
  return (
    <div className="kpi" data-tone={tone}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {hint && <span className="fine">{hint}</span>}
    </div>
  );
}

/** 사용량 막대: 글자 값을 함께 표시 */
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const tone = ratio >= 1 ? 'danger' : ratio >= 0.9 ? 'warning' : undefined;
  return (
    <div className="meter" data-tone={tone}>
      <div className="between"><span className="fine">{label}</span><strong className="num">{value} / {max}</strong></div>
      <div className="meter-track" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
        <div className="meter-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

export function Card({ title, description, actions, children, testId }: {
  title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; testId?: string;
}) {
  return (
    <section className="card" data-testid={testId}>
      {(title || actions) && (
        <div className="card-header">
          <div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export const LEARNING_STEPS: StepItem[] = [
  { key: 'intake', labelKey: 'steps.intake', href: '/intake' },
  { key: 'review', labelKey: 'steps.review', href: '/review' },
  { key: 'documents', labelKey: 'steps.documents', href: '/documents' },
];

/**
 * ADR 0037: 번역문 속 자리({link} 등)에 링크·강조 같은 요소를 끼운다.
 * 언어마다 어순이 달라 문장을 앞·뒤로 쪼개 옮기지 않고, 한 문장을 옮긴 뒤 자리에서 나눈다.
 * 예: withLink(t('people.needLevel'), <Link href="/academics">…</Link>)
 */
export function withLink(text: string, node: React.ReactNode, slot = 'link'): React.ReactNode {
  const [before, after = ''] = text.split(`{${slot}}`);
  return <>{before}{node}{after}</>;
}
