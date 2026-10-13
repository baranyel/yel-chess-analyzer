// Colour helpers shared by the summary, phase and account-result views.

// Fixed pill colours — dark enough for white text on every theme.
const ACCURACY_COLORS = [
  { min: 90, bg: '#15803d' },  // green-700
  { min: 75, bg: '#3f6212' },  // lime-800
  { min: 60, bg: '#a16207' },  // yellow-700
  { min: 45, bg: '#c2410c' },  // orange-700
  { min: 0,  bg: '#b91c1c' },  // red-700
] as const;

/** Background for an accuracy-percentage pill. */
export function accuracyBg(value: number): string {
  return (ACCURACY_COLORS.find((c) => value >= c.min) ?? ACCURACY_COLORS[ACCURACY_COLORS.length - 1]).bg;
}

/** CSS variable colour for an Elo estimate (theme-aware, see index.css). */
export function eloColor(elo: number): string {
  if (elo >= 2400) return 'var(--clr-elo-5)';
  if (elo >= 2000) return 'var(--clr-elo-4)';
  if (elo >= 1700) return 'var(--clr-elo-3)';
  if (elo >= 1400) return 'var(--clr-elo-2)';
  return 'var(--clr-elo-1)';
}
