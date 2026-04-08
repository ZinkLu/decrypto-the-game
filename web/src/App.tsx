import { useEffect } from 'react';
import { useGameStore, GamePhase, PlayerRole } from './store/gameStore';
import Home from './pages/Home';
import Room from './pages/Room';
import Encryptor from './pages/Encryptor';
import TeammateWaiting from './pages/TeammateWaiting';
import OpponentWaiting from './pages/OpponentWaiting';
import EncryptorWatching from './pages/EncryptorWatching';
import TeammateDecoding from './pages/TeammateDecoding';
import OpponentAnalyzing from './pages/OpponentAnalyzing';
import InterceptedWaiting from './pages/InterceptedWaiting';
import OpponentIntercepting from './pages/OpponentIntercepting';
import RoundResult from './pages/RoundResult';
import GameOver from './pages/GameOver';

function getPageComponent(phase: GamePhase, role: PlayerRole): React.FC {
  switch (phase) {
    case 'home':
      return Home;
    case 'room':
      return Room;
    case 'encrypting':
      if (role === 'encryptor') return Encryptor;
      if (role === 'teammate') return TeammateWaiting;
      return OpponentWaiting;
    case 'intercept':
      if (role === 'opponent') return OpponentIntercepting;
      return InterceptedWaiting;
    case 'decrypt':
      if (role === 'encryptor') return EncryptorWatching;
      if (role === 'teammate') return TeammateDecoding;
      return OpponentAnalyzing;
    case 'round_result':
      return RoundResult;
    case 'game_over':
      return GameOver;
    default:
      return Home;
  }
}

export default function App() {
  const { phase, myRole, connect } = useGameStore();

  useEffect(() => { connect(); }, [connect]);

  const PageComponent = getPageComponent(phase, myRole);

  return (
    <main className="w-full h-full relative">
      <PageComponent />
    </main>
  );
}
