import { useState } from 'react';
import Home from './pages/Home';
import Encryptor from './pages/Encryptor';
import TeammateWaiting from './pages/TeammateWaiting';

export default function App() {
  const [currentPage, setCurrentPage] = useState<'home' | 'encryptor' | 'teammate-waiting'>('home');

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

  if (currentPage === 'teammate-waiting') {
    return (
      <div className="w-full h-full">
        <TeammateWaiting />
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
      {/* Debug buttons to test pages */}
      <div className="fixed bottom-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => setCurrentPage('encryptor')}
          className="px-3 py-1 text-xs bg-[#1a1a1a] text-[#ffaa00] border border-[#4a3a2a] rounded"
          style={{ fontFamily: "'VT323', monospace" }}
        >
          TEST A1 →
        </button>
        <button
          onClick={() => setCurrentPage('teammate-waiting')}
          className="px-3 py-1 text-xs bg-[#1a1a1a] text-[#00aaff] border border-[#2a3a4a] rounded"
          style={{ fontFamily: "'VT323', monospace" }}
        >
          TEST A2 →
        </button>
      </div>
    </div>
  );
}
