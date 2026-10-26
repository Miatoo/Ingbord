import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './themes/pink-cute.css';

try {
  if (window.matchMedia('(pointer: coarse)').matches) {
    // 触屏浏览器：关闭 #root zoom，避免操作时整页闪白
    document.documentElement.classList.add('touch-web');
  }
} catch {
  // ignore
}

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
