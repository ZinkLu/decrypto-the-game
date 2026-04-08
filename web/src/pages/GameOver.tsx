import { rawColors } from '../theme/colors';
import {
  ManilaFolder,
  RubberStamp,
  TypewriterText,
  DossierButton,
  DossierEffectLayer,
} from '../components/dossier';
import { useGameStore } from '../store/gameStore';

function FinalScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span
        className="text-sm"
        style={{ fontFamily: "'Noto Serif SC', serif", color: rawColors.inkBlack }}
      >
        {label}
      </span>
      <span
        className="text-base font-bold"
        style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.brass }}
      >
        {value}
      </span>
    </div>
  );
}

function TeamScoreCard({
  teamLabel,
  interceptions,
  decryptFailures,
  accentColor,
  borderColor,
}: {
  teamLabel: string;
  interceptions: number;
  decryptFailures: number;
  accentColor: string;
  borderColor: string;
}) {
  return (
    <div
      className="flex-1 px-4 py-3 rounded-lg"
      style={{
        background: rawColors.bgPaper,
        border: `2px solid ${borderColor}`,
      }}
    >
      <p
        className="text-center text-xs tracking-widest mb-2"
        style={{ fontFamily: "'Bebas Neue', sans-serif", color: accentColor, letterSpacing: '3px' }}
      >
        {teamLabel}
      </p>
      <FinalScoreRow label="拦截成功" value={interceptions} />
      <FinalScoreRow label="解密失误" value={decryptFailures} />
    </div>
  );
}

type Outcome = 'win' | 'lose' | 'tie';

function getOutcome(winner: string | null, myTeam: string): Outcome {
  if (winner === null) return 'tie';
  if (winner === myTeam) return 'win';
  return 'lose';
}

function getStampConfig(outcome: Outcome): { text: string; color: 'red' | 'green' } {
  switch (outcome) {
    case 'win':
      return { text: 'MISSION COMPLETE', color: 'green' };
    case 'lose':
      return { text: 'COMPROMISED', color: 'red' };
    case 'tie':
      return { text: 'STALEMATE', color: 'red' };
  }
}

function getTypewriterConfig(outcome: Outcome): { text: string; color: string } {
  switch (outcome) {
    case 'win':
      return { text: 'VICTORY', color: rawColors.teamFriendly };
    case 'lose':
      return { text: 'DEFEAT', color: rawColors.intelRed };
    case 'tie':
      return { text: 'MISSION INCONCLUSIVE', color: rawColors.brass };
  }
}

function getWinnerAnnouncement(winner: string | null): string {
  if (winner === null) return '双方势均力敌，本局平局';
  if (winner === 'A') return 'ALPHA 队获得胜利！';
  if (winner === 'B') return 'BRAVO 队获得胜利！';
  return `${winner} 队获得胜利！`;
}

export default function GameOver() {
  const { gameOver, scoreA, scoreB, myTeam, reset } = useGameStore();

  const winner = gameOver?.winner ?? null;
  const outcome = getOutcome(winner, myTeam);
  const stamp = getStampConfig(outcome);
  const typewriter = getTypewriterConfig(outcome);
  const announcement = getWinnerAnnouncement(winner);

  return (
    <div
      className="relative w-full h-full overflow-hidden flex items-center justify-center"
      style={{
        background: `linear-gradient(180deg, ${rawColors.navyDark} 0%, ${rawColors.bgDark} 100%)`,
      }}
    >
      <DossierEffectLayer />

      <div className="relative z-10 w-full max-w-sm px-4">
        <ManilaFolder tabLabel="AFTER ACTION REPORT">
          <div className="flex flex-col items-center gap-4">
            {/* Rubber stamp result */}
            <div className="flex justify-center mt-2">
              <RubberStamp
                text={stamp.text}
                color={stamp.color}
                size="large"
                rotation={-3}
                animated
              />
            </div>

            {/* Typewriter outcome headline */}
            <TypewriterText
              text={typewriter.text}
              size="large"
              color={typewriter.color}
              as="h1"
              className="text-center mt-2"
            />

            {/* Winner announcement in Chinese */}
            <p
              className="text-center text-base"
              style={{
                fontFamily: "'Noto Serif SC', serif",
                color: rawColors.inkBlue,
              }}
            >
              {announcement}
            </p>

            {/* Divider */}
            <div
              className="w-full border-t"
              style={{ borderColor: rawColors.creamDark }}
            />

            {/* Final scores */}
            <div className="w-full flex gap-3">
              <TeamScoreCard
                teamLabel="ALPHA"
                interceptions={scoreA.interceptions}
                decryptFailures={scoreA.decrypt_failures}
                accentColor={rawColors.teamFriendly}
                borderColor={rawColors.teamFriendlyDim}
              />
              <TeamScoreCard
                teamLabel="BRAVO"
                interceptions={scoreB.interceptions}
                decryptFailures={scoreB.decrypt_failures}
                accentColor={rawColors.intelRed}
                borderColor={rawColors.intelRedDim}
              />
            </div>

            {/* Return to base button */}
            <DossierButton
              variant="primary"
              size="large"
              fullWidth
              onClick={reset}
              className="mt-2"
            >
              RETURN TO BASE
            </DossierButton>
          </div>
        </ManilaFolder>
      </div>
    </div>
  );
}
