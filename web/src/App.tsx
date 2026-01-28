import { useState } from 'react';
import Home from './pages/Home';
import Encryptor from './pages/Encryptor';
import TeammateWaiting from './pages/TeammateWaiting';
import OpponentWaiting from './pages/OpponentWaiting';
import TransitionOverlay, { TransitionRole } from './components/TransitionOverlay';

type PageType = 'home' | 'encryptor' | 'teammate-waiting' | 'opponent-waiting';

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('home');
  const [pendingPage, setPendingPage] = useState<PageType | null>(null);
  const [transitionRole, setTransitionRole] = useState<TransitionRole>('encryptor');

  // 切换页面（带过渡动画）
  const switchPage = (page: PageType, role: TransitionRole) => {
    setPendingPage(page);
    setTransitionRole(role);
  };

  // 过渡完成回调
  const handleTransitionComplete = () => {
    if (pendingPage) {
      setCurrentPage(pendingPage);
      setPendingPage(null);
    }
  };

  // 如果有待处理的过渡，显示过渡层
  if (pendingPage) {
    return (
      <>
        {/* 当前页面淡出 */}
        {currentPage === 'encryptor' && <Encryptor />}
        {currentPage === 'teammate-waiting' && <TeammateWaiting />}
        {currentPage === 'opponent-waiting' && <OpponentWaiting />}
        {currentPage === 'home' && <Home />}

        {/* 过渡动画 */}
        <TransitionOverlay
          role={transitionRole}
          onComplete={handleTransitionComplete}
        />
      </>
    );
  }

  if (currentPage === 'encryptor') {
    return (
      <div className="w-full h-full relative">
        <Encryptor />
        {/* Debug button to go back */}
        <button
          onClick={() => switchPage('home', 'teammate')}
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
      <div className="w-full h-full relative">
        <TeammateWaiting />
        {/* Debug button to go back */}
        <button
          onClick={() => switchPage('home', 'encryptor')}
          className="fixed top-4 right-4 z-50 px-3 py-1 text-xs bg-[#1a1a1a] text-[#00ff88] border border-[#3d5544] rounded"
          style={{ fontFamily: "'VT323', monospace" }}
        >
          ← BACK
        </button>
      </div>
    );
  }

  if (currentPage === 'opponent-waiting') {
    return (
      <div className="w-full h-full relative">
        <OpponentWaiting />
        {/* Debug button to go back */}
        <button
          onClick={() => switchPage('home', 'opponent')}
          className="fixed top-4 right-4 z-50 px-3 py-1 text-xs bg-[#1a1a1a] text-[#00aaff] border border-[#2a4a6a] rounded"
          style={{ fontFamily: "'VT323', monospace" }}
        >
          ← BACK
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <Home />

      {/* Debug buttons to test pages and transitions */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {/* 过渡动画测试按钮 */}
        <div className="flex gap-2">
          <button
            onClick={() => switchPage('encryptor', 'encryptor')}
            className="px-3 py-1 text-xs bg-[#1a1a1a] text-[#00ff88] border border-[#3d5544] rounded"
            style={{ fontFamily: "'VT323', monospace" }}
          >
            过渡→加密者
          </button>
          <button
            onClick={() => switchPage('teammate-waiting', 'teammate')}
            className="px-3 py-1 text-xs bg-[#1a1a1a] text-[#00aaff] border border-[#2a3a4a] rounded"
            style={{ fontFamily: "'VT323', monospace" }}
          >
            过渡→队友
          </button>
          <button
            onClick={() => switchPage('opponent-waiting', 'opponent')}
            className="px-3 py-1 text-xs bg-[#1a1a1a] text-[#ff4444] border border-[#5a2020] rounded"
            style={{ fontFamily: "'VT323', monospace" }}
          >
            过渡→对手
          </button>
        </div>

        {/* 直接跳转按钮 */}
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentPage('encryptor')}
            className="px-3 py-1 text-xs bg-[#2a2a2a] text-[#ffaa00] border border-[#4a3a2a] rounded opacity-60"
            style={{ fontFamily: "'VT323', monospace" }}
          >
            直接 A1
          </button>
          <button
            onClick={() => setCurrentPage('teammate-waiting')}
            className="px-3 py-1 text-xs bg-[#2a2a2a] text-[#00aaff] border border-[#2a3a4a] rounded opacity-60"
            style={{ fontFamily: "'VT323', monospace" }}
          >
            直接 A2-队友
          </button>
          <button
            onClick={() => setCurrentPage('opponent-waiting')}
            className="px-3 py-1 text-xs bg-[#2a2a2a] text-[#ff4444] border border-[#5a2020] rounded opacity-60"
            style={{ fontFamily: "'VT323', monospace" }}
          >
            直接 A2-对手
          </button>
        </div>
      </div>
    </div>
  );
}
