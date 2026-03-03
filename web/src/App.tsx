import { useState } from 'react';
import Home from './pages/Home';
import Encryptor from './pages/Encryptor';
import TeammateWaiting from './pages/TeammateWaiting';
import OpponentWaiting from './pages/OpponentWaiting';
import EncryptorWatching from './pages/EncryptorWatching';
import TeammateDecoding from './pages/TeammateDecoding';
import OpponentAnalyzing from './pages/OpponentAnalyzing';
import TransitionOverlay, { TransitionRole } from './components/TransitionOverlay';

type PageType =
  | 'home'
  | 'encryptor'
  | 'teammate-waiting'
  | 'opponent-waiting'
  | 'encryptor-watching'
  | 'teammate-decoding'
  | 'opponent-analyzing';

const pageComponents: Record<PageType, React.FC> = {
  home: Home,
  encryptor: Encryptor,
  'teammate-waiting': TeammateWaiting,
  'opponent-waiting': OpponentWaiting,
  'encryptor-watching': EncryptorWatching,
  'teammate-decoding': TeammateDecoding,
  'opponent-analyzing': OpponentAnalyzing,
};

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('home');
  const [pendingPage, setPendingPage] = useState<PageType | null>(null);
  const [transitionRole, setTransitionRole] = useState<TransitionRole>('encryptor');

  // Switch page with transition
  const switchPage = (page: PageType, role: TransitionRole) => {
    setPendingPage(page);
    setTransitionRole(role);
  };

  // Transition complete callback
  const handleTransitionComplete = () => {
    if (pendingPage) {
      setCurrentPage(pendingPage);
      setPendingPage(null);
    }
  };

  // Render the current page component
  const CurrentPageComponent = pageComponents[currentPage];

  // Show transition overlay if pending
  if (pendingPage) {
    return (
      <>
        <CurrentPageComponent />
        <TransitionOverlay
          role={transitionRole}
          onComplete={handleTransitionComplete}
        />
      </>
    );
  }

  if (currentPage === 'home') {
    return (
      <main className="w-full h-full relative">
        <Home />

        {/* Debug buttons */}
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {/* A-phase transition buttons */}
          <div
            className="text-xs px-2 py-0.5 text-center"
            style={{ fontFamily: "'VT323', monospace", color: '#666' }}
          >
            A 阶段（加密）
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => switchPage('encryptor', 'encryptor')}
              className="px-3 py-1 text-xs bg-[#1a1a1a] text-[#00ff88] border border-[#3d5544] rounded"
              style={{ fontFamily: "'VT323', monospace" }}
            >
              过渡→A1加密
            </button>
            <button
              onClick={() => switchPage('teammate-waiting', 'teammate')}
              className="px-3 py-1 text-xs bg-[#1a1a1a] text-[#00ff88] border border-[#3d5544] rounded"
              style={{ fontFamily: "'VT323', monospace" }}
            >
              过渡→A2队友
            </button>
            <button
              onClick={() => switchPage('opponent-waiting', 'opponent')}
              className="px-3 py-1 text-xs bg-[#1a1a1a] text-[#ff4444] border border-[#5a2020] rounded"
              style={{ fontFamily: "'VT323', monospace" }}
            >
              过渡→A3对手
            </button>
          </div>

          {/* B-phase transition buttons */}
          <div
            className="text-xs px-2 py-0.5 text-center mt-1"
            style={{ fontFamily: "'VT323', monospace", color: '#666' }}
          >
            B 阶段（解码）
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => switchPage('encryptor-watching', 'encryptor')}
              className="px-3 py-1 text-xs bg-[#1a1a1a] text-[#00ff88] border border-[#3d5544] rounded"
              style={{ fontFamily: "'VT323', monospace" }}
            >
              过渡→B1观看
            </button>
            <button
              onClick={() => switchPage('teammate-decoding', 'teammate')}
              className="px-3 py-1 text-xs bg-[#1a1a1a] text-[#00ff88] border border-[#3d5544] rounded"
              style={{ fontFamily: "'VT323', monospace" }}
            >
              过渡→B2解码
            </button>
            <button
              onClick={() => switchPage('opponent-analyzing', 'opponent')}
              className="px-3 py-1 text-xs bg-[#1a1a1a] text-[#ff4444] border border-[#5a2020] rounded"
              style={{ fontFamily: "'VT323', monospace" }}
            >
              过渡→B3分析
            </button>
          </div>

          {/* Direct jump buttons */}
          <div className="flex gap-1 flex-wrap justify-end mt-1">
            {(
              [
                ['encryptor', 'A1'],
                ['teammate-waiting', 'A2'],
                ['opponent-waiting', 'A3'],
                ['encryptor-watching', 'B1'],
                ['teammate-decoding', 'B2'],
                ['opponent-analyzing', 'B3'],
              ] as [PageType, string][]
            ).map(([page, label]) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className="px-2 py-0.5 text-xs bg-[#2a2a2a] text-[#ffaa00] border border-[#4a3a2a] rounded opacity-60"
                style={{ fontFamily: "'VT323', monospace" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // Non-home pages: render with back button
  const isOpponentPage =
    currentPage === 'opponent-waiting' || currentPage === 'opponent-analyzing';
  const backColor = isOpponentPage ? '#ff4444' : '#00ff88';
  const backBorder = isOpponentPage ? '#5a2020' : '#3d5544';

  return (
    <main className="w-full h-full relative">
      <CurrentPageComponent />
      <button
        onClick={() => switchPage('home', 'teammate')}
        aria-label="返回首页"
        className="fixed top-4 right-4 z-50 px-3 py-1 text-xs bg-[#1a1a1a] rounded"
        style={{
          fontFamily: "'VT323', monospace",
          color: backColor,
          border: `1px solid ${backBorder}`,
        }}
      >
        <span aria-hidden="true">←</span> BACK
      </button>
    </main>
  );
}
