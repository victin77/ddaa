import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'racon_theme';

type Ctx = {
  theme: Theme;
  toggleTheme: (origin?: { x: number; y: number }) => void;
};

const ThemeContext = createContext<Ctx | null>(null);

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(next: Theme) {
  const root = document.documentElement;
  if (next === 'light') root.classList.add('light');
  else root.classList.remove('light');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const t = readInitial();
    if (typeof document !== 'undefined') applyTheme(t);
    return t;
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(
    (origin?: { x: number; y: number }) => {
      const next: Theme = theme === 'dark' ? 'light' : 'dark';
      const root = document.documentElement;
      const x = origin?.x ?? window.innerWidth / 2;
      const y = origin?.y ?? window.innerHeight / 2;
      const r = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );
      root.style.setProperty('--theme-ripple-x', `${x}px`);
      root.style.setProperty('--theme-ripple-y', `${y}px`);
      root.style.setProperty('--theme-ripple-r', `${r}px`);
      root.dataset.themeTransition = next;

      const cleanup = () => {
        delete root.dataset.themeTransition;
        root.style.removeProperty('--theme-ripple-x');
        root.style.removeProperty('--theme-ripple-y');
        root.style.removeProperty('--theme-ripple-r');
      };

      const supported =
        typeof (document as any).startViewTransition === 'function' &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (!supported) {
        applyTheme(next);
        setTheme(next);
        cleanup();
        return;
      }

      const transition = (document as any).startViewTransition(() => {
        applyTheme(next);
        setTheme(next);
      });
      transition.finished.then(cleanup).catch(cleanup);
    },
    [theme]
  );

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
