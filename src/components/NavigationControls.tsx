import { useEffect } from 'react';

interface Props {
  currentIndex: number;
  totalMoves: number;
  onNavigate: (index: number) => void;
}

export function NavigationControls({ currentIndex, totalMoves, onNavigate }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onNavigate(Math.max(0, currentIndex - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNavigate(Math.min(totalMoves, currentIndex + 1));
      } else if (e.key === 'ArrowUp' || e.key === 'Home') {
        e.preventDefault();
        onNavigate(0);
      } else if (e.key === 'ArrowDown' || e.key === 'End') {
        e.preventDefault();
        onNavigate(totalMoves);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentIndex, totalMoves, onNavigate]);

  const btn = (label: string, action: () => void, disabled: boolean, title: string) => (
    <button
      onClick={action}
      disabled={disabled}
      title={title}
      className={[
        'px-3 py-1.5 rounded text-lg font-bold transition-colors select-none',
        disabled
          ? 'text-faint cursor-not-allowed'
          : 'text-muted hover-surface hover:text-base active:opacity-70',
      ].join(' ')}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center justify-center gap-1 bg-surface border border-base rounded-lg px-2 py-1">
      {btn('⇤', () => onNavigate(0), currentIndex === 0, 'Başa dön (↑ / Home)')}
      {btn('←', () => onNavigate(currentIndex - 1), currentIndex === 0, 'Önceki hamle (←)')}
      <span className="text-xs text-faint font-mono w-14 text-center select-none">
        {currentIndex}/{totalMoves}
      </span>
      {btn('→', () => onNavigate(currentIndex + 1), currentIndex >= totalMoves, 'Sonraki hamle (→)')}
      {btn('⇥', () => onNavigate(totalMoves), currentIndex >= totalMoves, 'Sona git (↓ / End)')}
    </div>
  );
}
