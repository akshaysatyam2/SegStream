/**
 * useTheme.js — Dark/Light Theme Management Hook
 *
 * Manages the application's color theme with localStorage persistence.
 * Sets a `data-theme` attribute on the <html> element so CSS can
 * conditionally apply styles via [data-theme="dark"] selectors.
 *
 * SegStream defaults to dark theme (glassmorphism looks best dark).
 *
 * Usage:
 *   const theme = useTheme();
 *   // theme.theme      → 'dark' | 'light'
 *   // theme.toggleTheme → function to switch themes
 *   // theme.isDark      → boolean convenience accessor
 *
 * @author Akshay Satyam
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

/** LocalStorage key for persisting the user's theme preference */
const STORAGE_KEY = 'segstream-theme';

/**
 * Read the initial theme from localStorage or default to 'dark'.
 * This runs once on hook initialization to avoid a flash of
 * the wrong theme on page load.
 */
function getInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    /* localStorage may be unavailable in some environments */
  }

  /* Default to dark — glassmorphism looks best on dark backgrounds */
  return 'dark';
}

/**
 * useTheme — Custom hook for theme management.
 *
 * @returns {{ theme: string, toggleTheme: () => void, isDark: boolean }}
 */
export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  /**
   * Sync the theme to the DOM and localStorage whenever it changes.
   * We set data-theme on <html> so CSS custom properties can switch
   * via [data-theme="dark"] and [data-theme="light"] selectors.
   */
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);

    /* Persist to localStorage for next visit */
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* Silently fail — theme still works in-memory */
    }
  }, [theme]);

  /**
   * Toggle between dark and light themes.
   * Wrapped in useCallback to maintain a stable function reference
   * for components that receive it as a prop.
   */
  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  /** Convenience boolean — true when dark mode is active */
  const isDark = theme === 'dark';

  /* Memoize the return value to prevent needless re-renders */
  return useMemo(
    () => ({ theme, toggleTheme, isDark }),
    [theme, toggleTheme, isDark]
  );
}
