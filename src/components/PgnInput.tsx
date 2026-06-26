import { useState } from 'react';

const EXAMPLE_PGN = `[Event "F/S Return Match"]
[White "Fischer, Robert J."]
[Black "Spassky, Boris V."]
[Result "1-0"]
[WhiteElo "2785"]
[BlackElo "2660"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6
8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5 13. Nc3 Bb7
14. Bg5 b4 15. Nb1 h6 16. Bh4 c5 17. dxe5 Nxe4 18. Bxe7 Qxe7 19. exd6 Qf6
20. Nbd2 Nxd6 21. Nc4 Nxc4 22. Bxc4 Nb6 23. Ne5 Rae8 24. Bxf7+ Rxf7
25. Nxf7 Rxe1+ 26. Qxe1 Kxf7 27. Qe3 Qg5 28. Qxg5 hxg5 29. b3 Ke6
30. a3 Kd6 31. axb4 cxb4 32. Ra5 Nd5 33. f3 Bc8 34. Kf2 Bf5 35. Ra7 g6
36. Ra6+ Kc5 37. Ke1 Nf4 38. g3 Nxh3 39. Kd2 Kb5 40. Rd6 Kc5 41. Ra6 Nf2
42. g4 Bd3 43. Re6 1-0`;

interface Props {
  onAnalyze: (input: string) => void;
  isAnalyzing: boolean;
}

export function PgnInput({ onAnalyze, isAnalyzing }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Please paste a PGN or FEN before analyzing.');
      return;
    }
    setError(null);
    onAnalyze(trimmed);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-12">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            ♟ FreeChess Analyzer
          </h1>
          <p className="text-gray-400 text-sm">
            Paste a PGN or FEN — Stockfish will analyze every move in your browser.
          </p>
        </div>

        {/* Input area */}
        <div className="space-y-3">
          <textarea
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            placeholder="Paste PGN or FEN here…"
            rows={12}
            className="w-full bg-gray-800/80 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 placeholder-gray-600 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            spellCheck={false}
          />

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={isAnalyzing}
              className={`
                flex-1 py-2.5 px-6 rounded-lg font-semibold text-sm transition-all
                ${isAnalyzing
                  ? 'bg-blue-700 text-blue-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white active:bg-blue-700'
                }
              `}
            >
              {isAnalyzing ? 'Analyzing…' : 'Analyze'}
            </button>
            <button
              onClick={() => { setValue(EXAMPLE_PGN); setError(null); }}
              className="px-4 py-2.5 rounded-lg text-sm text-gray-400 border border-gray-700 hover:border-gray-500 hover:text-gray-200 transition-colors"
            >
              Load Example
            </button>
          </div>
        </div>

        {/* Tips */}
        <div className="text-xs text-gray-600 space-y-1">
          <p>• PGN: standard algebraic notation with or without headers</p>
          <p>• FEN: a single FEN string for a static position</p>
          <p>• Analysis runs entirely in your browser — no data is sent to any server</p>
        </div>
      </div>
    </div>
  );
}
