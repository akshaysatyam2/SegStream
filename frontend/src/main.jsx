/**
 * SegStream — Application Entry Point
 *
 * Mounts the React app into the DOM and wraps it with the
 * StreamProvider for global state management. StrictMode is
 * enabled for development to catch common React anti-patterns.
 *
 * @author Akshay Satyam
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StreamProvider } from './context/StreamContext.jsx';
import App from './App.jsx';
import './index.css';

/* Mount into #root — the only DOM node in index.html */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StreamProvider>
      <App />
    </StreamProvider>
  </StrictMode>,
);
