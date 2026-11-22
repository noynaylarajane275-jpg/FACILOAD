import type { ReactNode } from 'react';

export function GlowCard({ children, className = '' }: { children: ReactNode; className?: string }): JSX.Element {
  return <article className={`landing-glow-card ${className}`} tabIndex={0} onPointerMove={event => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--glow-x', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--glow-y', `${event.clientY - rect.top}px`);
  }}>{children}</article>;
}
