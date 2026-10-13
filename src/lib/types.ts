export type MoveClassification =
  | 'kusursuz'    // Forced / only good move
  | 'muhtesem'    // Brilliant — complex position, non-obvious best move
  | 'best'        // Best move (alternatives exist and are close)
  | 'excellent'   // Very small cp loss
  | 'good'        // Small cp loss
  | 'inaccuracy'  // Medium cp loss
  | 'mistake'     // Large cp loss
  | 'blunder'     // Very large cp loss
  | 'unknown';

export interface EvalResult {
  type: 'cp' | 'mate';
  value: number;  // always from WHITE's perspective (positive = white better)
}

/** Engine verdict for a single position (scores are White's POV). */
export interface PositionAnalysis {
  eval: EvalResult;
  bestMove: string;               // UCI; '' for a terminal position
  alternatives: string[];         // UCI moves for lines 2..n
  alternativeEvals: EvalResult[]; // scores for lines 2..n
  depth: number;
}

export interface AnalyzedMove {
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  evalBefore: EvalResult | null;
  evalAfter: EvalResult | null;
  bestMove: string | null;
  alternatives: string[];
  alternativeEvals: EvalResult[];
  classification: MoveClassification;
  cpLoss: number;
  commentary?: string;         // placeholder for future LLM commentary
}

export interface PlayerStats {
  kusursuz: number;
  muhtesem: number;
  best: number;
  excellent: number;
  good: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
  accuracy: number;
  acpl: number;            // average centipawn loss
  estimatedElo: number;    // estimated FIDE rating based on ACPL
}

export interface GameSummaryStats {
  white: PlayerStats;
  black: PlayerStats;
}

export interface PgnMetadata {
  white: string;
  black: string;
  event: string;
  date: string;
  result: string;
  whiteElo?: string;
  blackElo?: string;
}
