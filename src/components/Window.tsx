import type { ReactNode } from 'react';

interface Props {
  /** Names the pane's function ("Tahta", "Analiz"). */
  title: string;
  /** Real actions of this pane, rendered in the title bar (see .win-btn). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** An XP-style window. The title bar is information, not decoration. */
export function Window({ title, actions, children, className = '', bodyClassName = '' }: Props) {
  return (
    <section className={`win ${className}`} aria-label={title}>
      <header className="win-title">
        <h2 className="win-name m-0 font-[inherit] text-[length:inherit] font-normal">{title}</h2>
        {actions}
      </header>
      <div className={`win-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}
