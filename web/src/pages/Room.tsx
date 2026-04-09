import { useState } from 'react';
import { rawColors } from '../theme/colors';
import {
  ManilaFolder,
  RubberStamp,
  TypewriterText,
  DossierButton,
  WaxSeal,
  DossierEffectLayer,
  AgentPanel,
} from '../components/dossier';
import { useGameStore } from '../store/gameStore';
import type { PlayerInfo } from '../store/gameStore';

export default function Room() {
  const {
    roomCode,
    teamA,
    teamB,
    ownerID,
    canStart,
    myPlayerID,
    selectTeam,
    addAI,
    removeAI,
    startGame,
  } = useGameStore();

  const isOwner = myPlayerID === ownerID;

  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
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
      <div className="relative z-10 flex items-center justify-center h-full p-4 overflow-y-auto">
        <ManilaFolder tabLabel="BRIEFING ROOM" className="w-full max-w-2xl">
          {/* Top: WaxSeal + CLASSIFIED stamp */}
          <div className="flex justify-between items-start mb-5">
            <WaxSeal size="medium" />
            <RubberStamp text="CLASSIFIED" color="red" size="medium" rotation={-4} />
          </div>

          {/* Title */}
          <div className="text-center mb-4">
            <TypewriterText text="BRIEFING ROOM" size="large" color="dark" as="h1" />
            <div
              className="mt-1"
              style={{
                fontFamily: "'Noto Serif SC', serif",
                fontSize: '0.875rem',
                color: rawColors.inkBlack,
                opacity: 0.65,
              }}
            >
              Mission Briefing Room
            </div>
          </div>

          {/* Divider */}
          <div
            className="mx-4 my-3 border-t border-dashed"
            style={{ borderColor: rawColors.creamDark }}
          />

          {/* Room Code Display */}
          <div className="mb-5">
            <div
              className="text-center mb-1"
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontSize: '0.7rem',
                color: rawColors.inkBlack,
                opacity: 0.55,
                letterSpacing: '2px',
                textTransform: 'uppercase',
              }}
            >
              OPERATION CODE
            </div>
            <div className="flex items-center justify-center gap-3">
              <span
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: '2.5rem',
                  letterSpacing: '8px',
                  color: rawColors.inkBlue,
                  textShadow: `0 1px 2px rgba(0,0,0,0.15)`,
                }}
              >
                {roomCode ?? '------'}
              </span>
              <button
                onClick={handleCopyCode}
                title="Copy room code"
                style={{
                  background: copied ? `${rawColors.teamFriendly}20` : `${rawColors.brass}20`,
                  border: `1px solid ${copied ? rawColors.teamFriendly : rawColors.brass}`,
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontFamily: "'Courier Prime', monospace",
                  fontSize: '0.7rem',
                  color: copied ? rawColors.teamFriendly : rawColors.brass,
                  cursor: 'pointer',
                  letterSpacing: '1px',
                  transition: 'all 0.2s',
                }}
              >
                {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>
          </div>

          {/* Divider */}
          <div
            className="mx-4 my-3 border-t border-dashed"
            style={{ borderColor: rawColors.creamDark }}
          />

          {/* Team Columns */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            <TeamColumn
              label="ALPHA"
              players={teamA}
              accentColor={rawColors.teamFriendly}
              accentDimColor={rawColors.teamFriendlyDim}
              accentLightColor={rawColors.teamFriendlyLight}
              myPlayerID={myPlayerID}
              isOwner={isOwner}
              onJoin={() => selectTeam('A')}
              onAddAI={() => addAI('A')}
              onRemoveAI={(index) => removeAI('A', index)}
            />
            <TeamColumn
              label="BRAVO"
              players={teamB}
              accentColor={rawColors.intelRed}
              accentDimColor={rawColors.intelRedDim}
              accentLightColor={rawColors.teamEnemyLight}
              myPlayerID={myPlayerID}
              isOwner={isOwner}
              onJoin={() => selectTeam('B')}
              onAddAI={() => addAI('B')}
              onRemoveAI={(index) => removeAI('B', index)}
            />
          </div>

          {/* Divider */}
          <div
            className="mx-4 my-3 border-t border-dashed"
            style={{ borderColor: rawColors.creamDark }}
          />

          {/* Bottom: Owner sees start button, non-owners see waiting panel */}
          {isOwner ? (
            <div className="flex flex-col items-center gap-2">
              <DossierButton
                variant="primary"
                size="large"
                fullWidth
                disabled={!canStart}
                onClick={startGame}
              >
                COMMENCE OPERATION
              </DossierButton>
              {!canStart && (
                <span
                  style={{
                    fontFamily: "'Courier Prime', monospace",
                    fontSize: '0.7rem',
                    color: rawColors.inkBlack,
                    opacity: 0.5,
                    letterSpacing: '1px',
                  }}
                >
                  Each team needs at least 2 members
                </span>
              )}
            </div>
          ) : (
            <AgentPanel emoji="⏳" message="Waiting for host to start..." theme="friendly" />
          )}
        </ManilaFolder>
      </div>
    </div>
  );
}

// ─── TeamColumn ───────────────────────────────────────────────────────────────

interface TeamColumnProps {
  label: string;
  players: PlayerInfo[];
  accentColor: string;
  accentDimColor: string;
  accentLightColor: string;
  myPlayerID: string;
  isOwner: boolean;
  onJoin: () => void;
  onAddAI: () => void;
  onRemoveAI: (index: number) => void;
}

function TeamColumn({
  label,
  players,
  accentColor,
  accentDimColor,
  accentLightColor,
  myPlayerID,
  isOwner,
  onJoin,
  onAddAI,
  onRemoveAI,
}: TeamColumnProps) {
  const isOnThisTeam = players.some((p) => p.id === myPlayerID);

  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-2"
      style={{
        background: `${accentColor}10`,
        border: `2px solid ${accentDimColor}`,
        boxShadow: `0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      {/* Team header */}
      <div className="text-center pb-2" style={{ borderBottom: `1px solid ${accentDimColor}40` }}>
        <span
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '1.1rem',
            letterSpacing: '3px',
            color: accentColor,
          }}
        >
          TEAM {label}
        </span>
        <div
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontSize: '0.65rem',
            color: accentColor,
            opacity: 0.6,
            letterSpacing: '1px',
          }}
        >
          {players.length} / 4
        </div>
      </div>

      {/* Player list */}
      <div className="flex flex-col gap-1 min-h-[80px]">
        {players.length === 0 ? (
          <div
            className="flex-1 flex items-center justify-center"
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontSize: '0.7rem',
              color: accentColor,
              opacity: 0.35,
              letterSpacing: '1px',
              fontStyle: 'italic',
            }}
          >
            — No members —
          </div>
        ) : (
          players.map((player, idx) => (
            <PlayerRow
              key={player.id}
              player={player}
              isSelf={player.id === myPlayerID}
              accentColor={accentColor}
              accentLightColor={accentLightColor}
              isOwner={isOwner}
              onRemoveAI={player.is_ai ? () => onRemoveAI(idx) : undefined}
            />
          ))
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-1 pt-1">
        {!isOnThisTeam && (
          <DossierButton
            variant="secondary"
            size="small"
            fullWidth
            onClick={onJoin}
            style={{ borderColor: accentColor, color: accentColor }}
          >
            JOIN
          </DossierButton>
        )}
        {isOwner && (
          <DossierButton
            variant="stamp"
            size="small"
            fullWidth
            onClick={onAddAI}
            style={{ borderColor: accentDimColor, color: accentDimColor }}
          >
            + AI
          </DossierButton>
        )}
      </div>
    </div>
  );
}

// ─── PlayerRow ────────────────────────────────────────────────────────────────

interface PlayerRowProps {
  player: PlayerInfo;
  isSelf: boolean;
  accentColor: string;
  accentLightColor: string;
  isOwner: boolean;
  onRemoveAI?: () => void;
}

function PlayerRow({
  player,
  isSelf,
  accentColor,
  accentLightColor,
  isOwner,
  onRemoveAI,
}: PlayerRowProps) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1 rounded"
      style={{
        background: isSelf ? `${accentColor}18` : 'transparent',
        border: isSelf ? `1px solid ${accentColor}40` : '1px solid transparent',
      }}
    >
      {/* Icon */}
      <span style={{ fontSize: '0.9rem' }}>{player.is_ai ? '🤖' : '👤'}</span>

      {/* Name */}
      <span
        className="flex-1 truncate"
        style={{
          fontFamily: "'Courier Prime', monospace",
          fontSize: '0.75rem',
          color: isSelf ? accentLightColor : accentColor,
          fontWeight: isSelf ? 700 : 400,
        }}
      >
        {player.nickname}
        {isSelf && (
          <span
            style={{
              marginLeft: '4px',
              fontSize: '0.6rem',
              opacity: 0.7,
              letterSpacing: '1px',
            }}
          >
            (YOU)
          </span>
        )}
      </span>

      {/* Remove AI button (owner only) */}
      {isOwner && player.is_ai && onRemoveAI && (
        <button
          onClick={onRemoveAI}
          title="Remove AI"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.65rem',
            color: rawColors.intelRed,
            opacity: 0.7,
            padding: '0 2px',
            fontFamily: "'Courier Prime', monospace",
            letterSpacing: '0.5px',
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
