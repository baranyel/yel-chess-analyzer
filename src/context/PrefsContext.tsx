import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import type { AppPrefs, ThemeId } from '../lib/themes';
import { loadPrefs, savePrefs, FONT_OPTIONS } from '../lib/themes';

interface PrefsContextValue {
  prefs: AppPrefs;
  setTheme: (t: ThemeId) => void;
  setBoardColor: (id: string) => void;
  setPieceSet: (id: string) => void;
  setBoardSize: (pct: number) => void;
  setFont: (id: string) => void;
}

const PrefsContext = createContext<PrefsContextValue | null>(null);

function applyFont(fontId: string) {
  const font = FONT_OPTIONS.find((f) => f.id === fontId) ?? FONT_OPTIONS[0];
  document.documentElement.style.setProperty('--font-family', font.stack);

  if (font.googleFont) {
    const linkId = `gfont-${font.id}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${font.googleFont}&display=swap`;
      document.head.appendChild(link);
    }
  }
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<AppPrefs>(loadPrefs);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.theme]);

  useEffect(() => {
    applyFont(prefs.fontId);
  }, [prefs.fontId]);

  useEffect(() => { savePrefs(prefs); }, [prefs]);

  const patch = useCallback((p: Partial<AppPrefs>) => setPrefs((prev) => ({ ...prev, ...p })), []);

  return (
    <PrefsContext.Provider value={{
      prefs,
      setTheme:      (theme)        => patch({ theme }),
      setBoardColor: (boardColorId) => patch({ boardColorId }),
      setPieceSet:   (pieceSetId)   => patch({ pieceSetId }),
      setBoardSize:  (boardSize)    => patch({ boardSize }),
      setFont:       (fontId)       => patch({ fontId }),
    }}>
      {children}
    </PrefsContext.Provider>
  );
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be inside PrefsProvider');
  return ctx;
}
