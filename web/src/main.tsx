import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { useGameStore } from './store/gameStore';

if (import.meta.env.DEV) {
  (window as unknown as { __store__: typeof useGameStore }).__store__ = useGameStore;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
