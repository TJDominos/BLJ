import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  const isBrowserExtensionError = (source?: unknown, stack?: unknown, message?: unknown): boolean => {
    const srcText = typeof source === 'string' ? source : '';
    const stackText = typeof stack === 'string' ? stack : '';
    const msgText = typeof message === 'string' ? message : '';
    const hasExtensionProtocol =
      srcText.startsWith('chrome-extension://') ||
      srcText.startsWith('moz-extension://') ||
      srcText.startsWith('safari-extension://') ||
      stackText.includes('chrome-extension://') ||
      stackText.includes('moz-extension://') ||
      stackText.includes('safari-extension://');
    if (hasExtensionProtocol) return true;
    return msgText.includes('Failed to connect to MetaMask') && stackText.includes('inpage.js');
  };

  window.addEventListener(
    'error',
    (event) => {
      if (isBrowserExtensionError(event.filename, event.error?.stack, event.message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      const reason = event.reason as { stack?: string; message?: string } | undefined;
      if (isBrowserExtensionError(undefined, reason?.stack, reason?.message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
