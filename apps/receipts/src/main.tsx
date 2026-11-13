import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/big-shoulders-display/500';
import '@fontsource/source-sans-3/400';
import '@fontsource/ibm-plex-mono/400';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
