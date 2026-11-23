'use client';
import { cloneElement, isValidElement, useId } from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * 입력 한 칸: 위쪽 라벨 · 필수 표시 · 도움말 · 오류 · 글자 수. 규칙: docs/design/DESIGN-SYSTEM.md '입력·파일 첨부'.
 * 자식은 입력 요소 하나(input·select·textarea). id·aria-describedby·aria-invalid·required를 붙여 준다.
 *
 *   <Field label="학교 이름" required hint="문서 머리에 쓰입니다" error={err} count={{ value: name.length, max: 40 }}>
 *     <input value={name} onChange={…} maxLength={40} />
 *   </Field>
 */
export function Field({ label, required, optional, hint, error, count, children, className, testId }: {
  label: React.ReactNode;
  required?: boolean;
  /** '(선택)' 표시 — 필수가 아닌 칸이 드물 때만 */
  optional?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  count?: { value: number; max: number };
  children: React.ReactElement<Record<string, unknown>>;
  className?: string;
  testId?: string;
}) {
  const auto = useId();
  const childProps = (isValidElement(children) ? children.props : {}) as Record<string, unknown>;
  const id = (childProps.id as string | undefined) ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-error` : undefined;
  const countId = count ? `${id}-count` : undefined;
  const describedBy = [childProps['aria-describedby'] as string | undefined, hintId, countId, errId].filter(Boolean).join(' ') || undefined;
  const over = count ? count.value > count.max : false;

  const control = isValidElement(children)
    ? cloneElement(children, {
      id, 'aria-describedby': describedBy,
      'aria-invalid': error || over ? true : (childProps['aria-invalid'] as boolean | undefined),
      required: required ?? childProps.required,
    })
    : children;

  return (
    <div className={`field${className ? ` ${className}` : ''}`} data-invalid={error || over ? true : undefined} data-testid={testId}>
      <div className="field-head">
        <label htmlFor={id} className="field-label">
          {label}
          {required && <span className="field-req" aria-hidden="true"> *</span>}
          {required && <span className="sr-only"> (필수)</span>}
          {optional && !required && <span className="field-opt"> (선택)</span>}
        </label>
        {count && <span id={countId} className="field-count num" data-over={over || undefined} aria-live="polite">{count.value}/{count.max}</span>}
      </div>
      {control}
      {hint && <p id={hintId} className="field-hint">{hint}</p>}
      {error && <p id={errId} className="field-error"><AlertCircle size={14} aria-hidden="true" /> <span className="sr-only">오류: </span>{error}</p>}
    </div>
  );
}

/** 켜기/끄기 스위치. 체크박스 의미(role=switch)를 그대로 써서 기존 폼·테스트와 맞는다. 글자 라벨 필수 */
export function Switch({ label, description, className, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: React.ReactNode; description?: React.ReactNode;
}) {
  return (
    <label className={`switch-row${className ? ` ${className}` : ''}`}>
      <input type="checkbox" role="switch" className="switch" {...props} />
      <span className="switch-text">
        <span>{label}</span>
        {description && <span className="field-hint">{description}</span>}
      </span>
    </label>
  );
}
