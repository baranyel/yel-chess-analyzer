import type { ReactNode } from 'react';

/** The wallpaper: Bliss sky (CSS, see .desk) plus the rolling hill drawn here so it can use theme variables. */
export function Desktop({ children }: { children: ReactNode }) {
  return (
    <div className="desk h-dvh flex flex-col overflow-hidden">
      <svg
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 w-full pointer-events-none"
        style={{ height: '44%', zIndex: -1 }}
        viewBox="0 0 1600 400"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="hill-front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--hill-top)' }} />
            <stop offset="1" style={{ stopColor: 'var(--hill-bottom)' }} />
          </linearGradient>
        </defs>
        <path
          d="M0 170 C 260 40 640 30 960 120 S 1450 130 1600 70 L1600 400 L0 400 Z"
          style={{ fill: 'var(--hill-top)', opacity: 0.55 }}
        />
        <path
          d="M0 230 C 300 120 700 110 1000 190 S 1480 210 1600 160 L1600 400 L0 400 Z"
          fill="url(#hill-front)"
        />
      </svg>
      {children}
    </div>
  );
}
