/**
 * Header.jsx — Top Navigation Bar
 *
 * Displays the SegStream branding, real-time connection status
 * indicator, and a theme toggle button. Uses glassmorphism styling
 * with a translucent blurred background.
 *
 * Props:
 *   theme — { theme, toggleTheme, isDark } from useTheme()
 *   connectionStatus — 'disconnected' | 'connecting' | 'connected' | 'error'
 *
 * @author Akshay Satyam
 */

import { memo, useCallback } from 'react';
import './Header.css';

/**
 * Map connection status to human-readable labels.
 */
const STATUS_LABELS = {
  disconnected: 'Disconnected',
  connecting: 'Connecting…',
  connected: 'Connected',
  error: 'Error',
};

function Header({ theme, connectionStatus, providerLabel }) {
  const { toggleTheme, isDark } = theme;

  /**
   * Prevent button click from bubbling and toggle the theme.
   */
  const handleThemeToggle = useCallback(
    (e) => {
      e.stopPropagation();
      toggleTheme();
    },
    [toggleTheme]
  );

  return (
    <header className="header">
      {/* Left section: Logo + App name */}
      <div className="header__brand">
        {/* SegStream icon — stylized 'S' using CSS gradient */}
        <div className="header__logo" aria-hidden="true">
          <span className="header__logo-text">S</span>
        </div>
        <div className="header__title-group">
          <h1 className="header__title">SegStream</h1>
          <span className="header__subtitle">Streaming Studio</span>
        </div>
      </div>

      {/* Center section: Connection status indicator */}
      <div className={`header__status header__status--${connectionStatus}`}>
        <span className="header__status-dot" />
        <span className="header__status-label">
          {connectionStatus === 'connected' && providerLabel
            ? `Connected · ${providerLabel}`
            : STATUS_LABELS[connectionStatus] || 'Unknown'}
        </span>
      </div>

      {/* Right section: Theme toggle */}
      <div className="header__actions">
        <button
          className="header__theme-toggle"
          onClick={handleThemeToggle}
          title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
        >
          {/* Sun icon for dark mode, Moon icon for light mode */}
          {isDark ? (
            /* Sun SVG */
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            /* Moon SVG */
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}

export default memo(Header);
