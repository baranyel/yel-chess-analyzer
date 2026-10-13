import { cpToWinPct, evalToCp } from './classification';
import type { AnalyzedMove, MoveClassification } from './types';

export interface GraphPoint {
  /** Position index: 0 = before the first move, i = after move i. */
  index: number;
  x: number;
  y: number;
  /** White's winning chance, 0–100. */
  winPct: number;
  /** Classification of the move that led to this position (none for index 0). */
  classification: MoveClassification | null;
}

export interface EvalGraphGeometry {
  points: GraphPoint[];
  /** Stepped line (pixel look) along the evaluation. */
  linePath: string;
  /** The same line closed down to the bottom: the area where White is ahead. */
  areaPath: string;
}

/**
 * One point per position, spread over `width`. y is measured from the top, so a
 * White-winning position is high on the graph and a Black-winning one is low.
 */
export function evalGraphGeometry(moves: AnalyzedMove[], width: number, height: number): EvalGraphGeometry {
  const first = moves[0]?.evalBefore;
  if (!first) return { points: [], linePath: '', areaPath: '' };

  const evals = [first, ...moves.map((m) => m.evalAfter)];
  const last = evals.length - 1;
  const points: GraphPoint[] = [];
  evals.forEach((e, i) => {
    if (!e) return; // an unanalysed position leaves a gap rather than a made-up value
    const winPct = cpToWinPct(evalToCp(e));
    points.push({
      index: i,
      x: last === 0 ? width / 2 : (i / last) * width,
      y: height * (1 - winPct / 100),
      winPct,
      classification: i === 0 ? null : moves[i - 1]!.classification,
    });
  });
  if (points.length === 0) return { points, linePath: '', areaPath: '' };

  const r = (n: number) => Math.round(n * 10) / 10;
  // step: hold the previous value until the next position, then jump
  let line = `M${r(points[0]!.x)} ${r(points[0]!.y)}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    line += ` H${r(p.x)} V${r(p.y)}`;
  }
  const area = `${line} V${r(height)} H${r(points[0]!.x)} Z`;
  return { points, linePath: line, areaPath: area };
}

/** The position under a click at `x` (0…width) on the graph. */
export function indexAtX(x: number, width: number, lastIndex: number): number {
  if (lastIndex <= 0 || width <= 0) return 0;
  return Math.min(lastIndex, Math.max(0, Math.round((x / width) * lastIndex)));
}
