import type { ReactNode } from 'react';

/** Shared section heading; the DOM order also remains the reading and keyboard order. */
export function SectionHead({ heading, body, action, stack = false }: {
  heading: ReactNode; body?: ReactNode; action?: ReactNode; stack?: boolean;
}) {
  return <div className="sec-copy" data-layout={stack ? 'stack' : 'heading'}>{heading}{body}{action}</div>;
}

