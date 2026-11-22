import Link from 'next/link';

/** 공통 컴포넌트. 규칙: docs/design/DESIGN-SYSTEM.md */

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'discovery';

/** 상태 배지: 항상 글자 포함, 클릭 불가 */
export function StatusBadge({ tone = 'neutral', children, dot = false }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  return <span className={`badge${dot ? ' badge-dot' : ''}`} data-tone={tone}>{children}</span>;
}

export type Crumb = { href?: string; label: string };

/** 화면마다 하나. 제목은 h1, 주 동작은 오른쪽에 최대 하나 */
export function PageHeader({ title, description, crumbs, status, meta, actions, children }: {
  title: React.ReactNode; description?: React.ReactNode; crumbs?: Crumb[]; status?: React.ReactNode;
  meta?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="경로"><ol className="breadcrumb">
          {crumbs.map((c, i) => <li key={i}>{c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}</li>)}
        </ol></nav>
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

/** 학사 흐름 단계: 자료 첨부 → 관리자 확인 → 문서 발행 */
export function Steps({ current, done = [], items }: {
  current: string; done?: string[]; items: { key: string; label: string; href?: string }[];
}) {
  return (
    <ol className="steps" aria-label="진행 단계">
      {items.map((s, i) => {
        const inner = <><span className="dot" aria-hidden="true">{done.includes(s.key) ? '✓' : i + 1}</span>{s.label}{done.includes(s.key) && <span className="sr-only"> (완료)</span>}</>;
        return (
          <li key={s.key} className={done.includes(s.key) ? 'done' : ''} aria-current={s.key === current ? 'step' : undefined}>
            {s.href && s.key !== current ? <Link href={s.href}>{inner}</Link> : inner}
          </li>
        );
      })}
    </ol>
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

export const LEARNING_STEPS = [
  { key: 'intake', label: '자료 첨부', href: '/intake' },
  { key: 'review', label: '관리자 확인', href: '/review' },
  { key: 'documents', label: '문서 발행', href: '/documents' },
];
