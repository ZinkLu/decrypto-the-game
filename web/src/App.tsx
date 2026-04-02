import { useState } from 'react';
import Home from './pages/Home';
import Encryptor from './pages/Encryptor';
import TeammateWaiting from './pages/TeammateWaiting';
import OpponentWaiting from './pages/OpponentWaiting';
import EncryptorWatching from './pages/EncryptorWatching';
import TeammateDecoding from './pages/TeammateDecoding';
import OpponentAnalyzing from './pages/OpponentAnalyzing';
import InterceptedWaiting from './pages/InterceptedWaiting';
import OpponentIntercepting from './pages/OpponentIntercepting';
import TransitionOverlay, { TransitionRole } from './components/TransitionOverlay';

type PageType =
  | 'home'
  | 'encryptor'
  | 'teammate-waiting'
  | 'opponent-waiting'
  | 'encryptor-watching'
  | 'teammate-decoding'
  | 'opponent-analyzing'
  | 'intercepted-waiting'
  | 'opponent-intercepting';

const pageComponents: Record<PageType, React.FC> = {
  home: Home,
  encryptor: Encryptor,
  'teammate-waiting': TeammateWaiting,
  'opponent-waiting': OpponentWaiting,
  'encryptor-watching': EncryptorWatching,
  'teammate-decoding': TeammateDecoding,
  'opponent-analyzing': OpponentAnalyzing,
  'intercepted-waiting': InterceptedWaiting,
  'opponent-intercepting': OpponentIntercepting,
};

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('home');
  const [pendingPage, setPendingPage] = useState<PageType | null>(null);
  const [transitionRole, setTransitionRole] = useState<TransitionRole>('encryptor');

  const switchPage = (page: PageType, role: TransitionRole) => {
    setPendingPage(page);
    setTransitionRole(role);
  };

  const handleTransitionComplete = () => {
    if (pendingPage) {
      setCurrentPage(pendingPage);
      setPendingPage(null);
    }
  };

  const CurrentPageComponent = pageComponents[currentPage];

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
          {/* A-phase */}
          <div
            className="text-xs px-2 py-0.5 text-center"
            style={{ fontFamily: "'Courier Prime', monospace", color: '#B8860B', opacity: 0.6 }}
          >
            A 阶段（加密）
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => switchPage('encryptor', 'encryptor')}
              className="px-3 py-1 text-xs rounded"
              style={{ fontFamily: "'Courier Prime', monospace", background: '#0B1426', color: '#0E7C6B', border: '1px solid #0A5A4D' }}
            >
              过渡→A1加密
            </button>
            <button
              onClick={() => switchPage('teammate-waiting', 'teammate')}
              className="px-3 py-1 text-xs rounded"
              style={{ fontFamily: "'Courier Prime', monospace", background: '#0B1426', color: '#0E7C6B', border: '1px solid #0A5A4D' }}
            >
              过渡→A2队友
            </button>
            <button
              onClick={() => switchPage('opponent-waiting', 'opponent')}
              className="px-3 py-1 text-xs rounded"
              style={{ fontFamily: "'Courier Prime', monospace", background: '#0B1426', color: '#8B0000', border: '1px solid #5C0000' }}
            >
              过渡→A3对手
            </button>
          </div>

          {/* B-phase */}
          <div
            className="text-xs px-2 py-0.5 text-center mt-1"
            style={{ fontFamily: "'Courier Prime', monospace", color: '#B8860B', opacity: 0.6 }}
          >
            B 阶段（解码）
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => switchPage('encryptor-watching', 'encryptor')}
              className="px-3 py-1 text-xs rounded"
              style={{ fontFamily: "'Courier Prime', monospace", background: '#0B1426', color: '#0E7C6B', border: '1px solid #0A5A4D' }}
            >
              过渡→B1观看
            </button>
            <button
              onClick={() => switchPage('teammate-decoding', 'teammate')}
              className="px-3 py-1 text-xs rounded"
              style={{ fontFamily: "'Courier Prime', monospace", background: '#0B1426', color: '#0E7C6B', border: '1px solid #0A5A4D' }}
            >
              过渡→B2解码
            </button>
            <button
              onClick={() => switchPage('opponent-analyzing', 'opponent')}
              className="px-3 py-1 text-xs rounded"
              style={{ fontFamily: "'Courier Prime', monospace", background: '#0B1426', color: '#8B0000', border: '1px solid #5C0000' }}
            >
              过渡→B3分析
            </button>
          </div>

          {/* C-phase */}
          <div
            className="text-xs px-2 py-0.5 text-center mt-1"
            style={{ fontFamily: "'Courier Prime', monospace", color: '#B8860B', opacity: 0.6 }}
          >
            C 阶段（拦截）
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => switchPage('intercepted-waiting', 'alert')}
              className="px-3 py-1 text-xs rounded"
              style={{ fontFamily: "'Courier Prime', monospace", background: '#0B1426', color: '#8B0000', border: '1px solid #5C0000' }}
            >
              过渡→C1被截
            </button>
            <button
              onClick={() => switchPage('opponent-intercepting', 'intercepting')}
              className="px-3 py-1 text-xs rounded"
              style={{ fontFamily: "'Courier Prime', monospace", background: '#0B1426', color: '#8B0000', border: '1px solid #5C0000' }}
            >
              过渡→C2拦截
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
                ['intercepted-waiting', 'C1'],
                ['opponent-intercepting', 'C2'],
              ] as [PageType, string][]
            ).map(([page, label]) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className="px-2 py-0.5 text-xs rounded opacity-60"
                style={{ fontFamily: "'Courier Prime', monospace", background: '#142038', color: '#B8860B', border: '1px solid #8B6508' }}
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
  const isOpponentPage = currentPage === 'opponent-waiting' || currentPage === 'opponent-analyzing' || currentPage === 'opponent-intercepting';
  const isAlertPage = currentPage === 'intercepted-waiting';
  const backColor = isOpponentPage || isAlertPage ? '#8B0000' : '#0E7C6B';
  const backBorder = isOpponentPage || isAlertPage ? '#5C0000' : '#0A5A4D';

  return (
    <main className="w-full h-full relative">
      <CurrentPageComponent />
      <button
        onClick={() => switchPage('home', 'teammate')}
        aria-label="返回首页"
        className="fixed top-4 right-4 z-50 px-3 py-1 text-xs rounded"
        style={{
          fontFamily: "'Courier Prime', monospace",
          color: backColor,
          border: `1px solid ${backBorder}`,
          background: '#0B1426',
        }}
      >
        <span aria-hidden="true">←</span> BACK
      </button>
    </main>
  );
}
