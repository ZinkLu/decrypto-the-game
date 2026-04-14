import { useState } from 'react';
import { rawColors } from '../theme/colors';
import { ManilaFolder, RubberStamp, TypewriterText, DossierButton, WaxSeal, DossierEffectLayer, TypewriterInput } from '../components/dossier';
import { useGameStore } from '../store/gameStore';

type Mode = 'menu' | 'create' | 'join';

export default function Home() {
  const [mode, setMode] = useState<Mode>('menu');
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');

  const { connected, createRoom, joinRoom } = useGameStore();

  const handleCreate = () => {
    if (nickname.trim()) {
      createRoom(nickname.trim());
    }
  };

  const handleJoin = () => {
    if (nickname.trim() && roomCode.trim()) {
      joinRoom(roomCode.trim(), nickname.trim());
    }
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ backgroundColor: rawColors.bgBase }}
    >
      <DossierEffectLayer />

      {/* Desk surface gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${rawColors.navyDark} 0%, ${rawColors.navy} 30%, ${rawColors.deskWoodDark} 100%)`,
        }}
      />

      {/* Main content */}
      <div className="relative z-10 flex items-center justify-center h-full p-6">
        <ManilaFolder tabLabel="CLASSIFIED" className="max-w-lg w-full">
          {/* Top secret stamp */}
          <div className="flex justify-between items-start mb-6">
            <WaxSeal size="medium" />
            <RubberStamp text="TOP SECRET" color="red" size="medium" rotation={-4} />
          </div>

          {/* Title */}
          <div className="text-center mb-6">
            <TypewriterText text="OPERATION: DECRYPTO" size="large" color="dark" as="h1" />
            <div
              className="mt-2"
              style={{
                fontFamily: "'Noto Serif SC', serif",
                fontSize: '1rem',
                color: rawColors.inkBlack,
                opacity: 0.7,
              }}
            >
              Team Code-Breaking Communication System
            </div>
          </div>

          {/* Divider */}
          <div
            className="mx-8 my-4 border-t border-dashed"
            style={{ borderColor: rawColors.creamDark }}
          />

          {/* Action area */}
          {mode === 'menu' && (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <DossierButton variant="primary" size="large" onClick={() => setMode('create')}>
                CREATE ROOM
              </DossierButton>

              <DossierButton variant="secondary" size="large" onClick={() => setMode('join')}>
                JOIN ROOM
              </DossierButton>
            </div>
          )}

          {mode === 'create' && (
            <div className="flex flex-col gap-4">
              <TypewriterInput
                value={nickname}
                onChange={setNickname}
                placeholder="ENTER CODENAME (NICKNAME)..."
                maxLength={20}
                color="dark"
                aria-label="Nickname"
              />
              <div className="flex gap-3 justify-center">
                <DossierButton variant="secondary" size="large" onClick={() => { setMode('menu'); setNickname(''); }}>
                  BACK
                </DossierButton>
                <DossierButton variant="primary" size="large" onClick={handleCreate} disabled={!nickname.trim()}>
                  CREATE
                </DossierButton>
              </div>
            </div>
          )}

          {mode === 'join' && (
            <div className="flex flex-col gap-4">
              <TypewriterInput
                value={nickname}
                onChange={setNickname}
                placeholder="ENTER CODENAME (NICKNAME)..."
                maxLength={20}
                color="dark"
                aria-label="Nickname"
              />
              <TypewriterInput
                value={roomCode}
                onChange={setRoomCode}
                placeholder="ENTER ROOM CODE..."
                maxLength={10}
                color="dark"
                aria-label="Room code"
              />
              <div className="flex gap-3 justify-center">
                <DossierButton variant="secondary" size="large" onClick={() => { setMode('menu'); setNickname(''); setRoomCode(''); }}>
                  BACK
                </DossierButton>
                <DossierButton variant="primary" size="large" onClick={handleJoin} disabled={!nickname.trim() || !roomCode.trim()}>
                  JOIN
                </DossierButton>
              </div>
            </div>
          )}

          {/* Status panel */}
          <div
            className="flex items-center justify-center gap-4 mt-6 p-3 rounded"
            style={{
              backgroundColor: rawColors.creamDark,
              border: `1px solid ${rawColors.brass}40`,
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="text-xs"
                style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.inkBlack }}
              >
                STATUS:
              </span>
              <span
                className="text-xs font-bold"
                style={{
                  fontFamily: "'Courier Prime', monospace",
                  color: connected ? rawColors.teamFriendly : rawColors.teamEnemy,
                }}
              >
                {connected ? 'CONNECTED' : 'CONNECTING...'}
              </span>
            </div>
          </div>

          {/* Bottom prompt */}
          <div className="mt-6 text-center">
            <span
              className="text-sm italic"
              style={{
                fontFamily: "'Courier Prime', monospace",
                color: rawColors.inkBlack,
                opacity: 0.5,
              }}
            >
              Awaiting operative instructions...
            </span>
          </div>
        </ManilaFolder>
      </div>
    </div>
  );
}
