import { useState } from 'react';
import Home from './pages/Home';
import Encryptor from './pages/Encryptor';

export default function App() {
  const [currentPage, setCurrentPage] = useState<'home' | 'encryptor'>('home');

  if (currentPage === 'encryptor') {
    return (
      <div className="w-full h-full">
        <Encryptor />
        {/* Debug button to go back */}
        <button
          onClick={() => setCurrentPage('home')}
          className="fixed top-4 right-4 z-50 px-3 py-1 text-xs bg-[#1a1a1a] text-[#00ff88] border border-[#3d5544] rounded"
          style={{ fontFamily: "'VT323', monospace" }}
        >
          ← BACK
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Home />
      {/* Debug button to test Encryptor page */}
      <button
        onClick={() => setCurrentPage('encryptor')}
        className="fixed bottom-4 right-4 z-50 px-3 py-1 text-xs bg-[#1a1a1a] text-[#ffaa00] border border-[#4a3a2a] rounded"
        style={{ fontFamily: "'VT323', monospace" }}
      >
        TEST A1 →
      </button>
    </div>
  );
}
