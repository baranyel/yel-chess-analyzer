import { useEffect, useState } from 'react';
import { useAnalysis } from './context/AnalysisContext';
import { usePrefs } from './context/PrefsContext';
import { BoardWindow } from './components/BoardWindow';
import { Desktop } from './components/Desktop';
import { HomeScene } from './components/HomeScene';
import { RightPanel } from './components/RightPanel';
import { Window } from './components/Window';

function TopBar() {
  const { state, reset } = useAnalysis();
  const { prefs, setTheme } = usePrefs();
  const { metadata } = state;
  const night = prefs.theme === 'gece';

  return (
    <header
      className="shrink-0 flex items-center gap-3 px-3 py-1.5"
      style={{
        color: 'var(--title-text)',
        background: 'linear-gradient(180deg, var(--title-to), var(--title-from))',
        borderBottom: '1px solid var(--win-edge)',
        boxShadow: '0 2px 0 rgba(0, 20, 70, .3)',
      }}
    >
      <button
        onClick={reset}
        title="Başa dön"
        className="shrink-0 flex items-center gap-2 rounded px-1.5 py-0.5 cursor-pointer hover:bg-white/15"
        style={{ fontFamily: 'var(--font-pixel)', fontSize: 18, textShadow: '1px 1px 0 rgba(0,0,30,.55)' }}
      >
        <span aria-hidden="true" className="text-xl leading-none">♚</span>
        <span className="whitespace-nowrap">Yel Satranç Analiz</span>
      </button>

      <div className="flex-1 min-w-0 text-center text-xs truncate hidden md:block" style={{ opacity: 0.92 }}>
        {metadata && (
          <>
            {metadata.white} — {metadata.black}
            {metadata.event && metadata.event !== 'Unknown Event' && metadata.event !== '?' && (
              <span className="ml-2 opacity-80">· {metadata.event}</span>
            )}
          </>
        )}
      </div>
      <div className="flex-1 md:hidden" />

      <button
        onClick={() => setTheme(night ? 'bliss' : 'gece')}
        aria-pressed={night}
        title={night ? 'Gündüz temasına geç' : 'Gece temasına geç'}
        className="win-btn"
      >
        {night ? 'Gündüz' : 'Gece'}
      </button>
      <span className="shrink-0 hidden md:block text-[11px] font-mono select-none opacity-70">
        v{__APP_VERSION__}
      </span>
    </header>
  );
}

type Scene = 'home' | 'board';

/** Keep in sync with .win-closing in index.css. */
const CLOSE_MS = 160;

/**
 * Switches scenes like an OS swaps windows: the outgoing window plays its close
 * animation first, then the incoming one mounts with its open animation.
 */
function useSceneTransition(target: Scene) {
  const [shown, setShown] = useState(target);
  const [closing, setClosing] = useState(false);
  const [opened, setOpened] = useState(false); // no open animation on first paint

  useEffect(() => {
    if (target === shown) { setClosing(false); return; }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setClosing(true);
    const t = window.setTimeout(() => {
      setShown(target);
      setClosing(false);
      setOpened(true);
    }, reduced ? 0 : CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [target, shown]);

  const motion = closing ? 'win-closing' : opened ? 'win-opening' : '';
  return { scene: shown, motion };
}

export default function App() {
  const { state } = useAnalysis();
  const { scene, motion } = useSceneTransition(state.status !== 'idle' ? 'board' : 'home');
  const hasGame = scene === 'board';

  return (
    <Desktop>
      <TopBar />
      <main className="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden p-3 xl:p-5">
        <div className="flex flex-col xl:flex-row gap-4 xl:justify-center xl:h-full">
          {hasGame
            ? <BoardWindow key="board" className={`xl:shrink-0 xl:max-h-full ${motion}`} />
            : <HomeScene key="home" className={`xl:w-[44rem] xl:h-[min(100%,38rem)] xl:self-center xl:shrink-0 ${motion}`} />}
          <Window
            title="Analiz"
            className={`shrink-0 xl:w-[26rem] max-xl:h-[78dvh] max-xl:min-h-[30rem] ${hasGame ? "" : "xl:h-[min(100%,38rem)] xl:self-center"}`}
          >
            <RightPanel />
          </Window>
        </div>
      </main>
    </Desktop>
  );
}
