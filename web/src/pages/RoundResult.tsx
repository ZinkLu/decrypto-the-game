import { rawColors } from '../theme/colors';
import {
  RubberStamp,
  AgentPanel,
  DossierEffectLayer,
} from '../components/dossier';
import { useGameStore } from '../store/gameStore';

function ScoreBoard() {
  const { scoreA, scoreB } = useGameStore();

  return (
    <div className="flex gap-6 justify-center mt-4">
      {/* Team ALPHA */}
      <div
        className="flex flex-col items-center px-5 py-3 rounded-lg"
        style={{
          background: rawColors.navyLight,
          border: `2px solid ${rawColors.teamFriendlyDim}`,
          minWidth: '130px',
        }}
      >
        <span
          className="text-xs tracking-widest mb-1"
          style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.teamFriendly, letterSpacing: '3px' }}
        >
          ALPHA
        </span>
        <span
          className="text-sm"
          style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.cream }}
        >
          拦截 {scoreA.interceptions}/2
        </span>
        <span
          className="text-sm"
          style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.intelRedDim }}
        >
          失误 {scoreA.decrypt_failures}/2
        </span>
      </div>

      {/* Divider */}
      <div className="flex items-center">
        <span
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            color: rawColors.brassDim,
            fontSize: '1.5rem',
          }}
        >
          VS
        </span>
      </div>

      {/* Team BRAVO */}
      <div
        className="flex flex-col items-center px-5 py-3 rounded-lg"
        style={{
          background: rawColors.navyLight,
          border: `2px solid ${rawColors.intelRedDim}`,
          minWidth: '130px',
        }}
      >
        <span
          className="text-xs tracking-widest mb-1"
          style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.intelRed, letterSpacing: '3px' }}
        >
          BRAVO
        </span>
        <span
          className="text-sm"
          style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.cream }}
        >
          拦截 {scoreB.interceptions}/2
        </span>
        <span
          className="text-sm"
          style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.intelRedDim }}
        >
          失误 {scoreB.decrypt_failures}/2
        </span>
      </div>
    </div>
  );
}

function getStampConfig(roundResult: { intercept_success?: boolean; decrypt_success?: boolean } | null): {
  text: string;
  color: 'red' | 'green';
  agentEmoji: string;
  agentMessage: string;
  agentTheme: 'friendly' | 'enemy' | 'alert';
} {
  if (!roundResult) {
    return { text: 'PROCESSING', color: 'red', agentEmoji: '⏳', agentMessage: '处理结果中…', agentTheme: 'friendly' };
  }

  const { intercept_success, decrypt_success } = roundResult;

  // Intercept succeeded (opponent broke the code)
  if (intercept_success === true) {
    return { text: 'INTERCEPTED', color: 'red', agentEmoji: '🚨', agentMessage: '通讯已被截获！', agentTheme: 'alert' };
  }

  // Decrypt failed (own team failed to decode)
  if (decrypt_success === false) {
    return { text: 'DECRYPT FAIL', color: 'red', agentEmoji: '❌', agentMessage: '解密失败…', agentTheme: 'alert' };
  }

  // Decrypt succeeded — at this point decrypt_success is true | undefined
  if (decrypt_success === true) {
    // If intercept was attempted and failed, emphasise SECURE
    if (intercept_success === false) {
      return { text: 'SECURE', color: 'green', agentEmoji: '🛡️', agentMessage: '拦截失败，通讯安全', agentTheme: 'friendly' };
    }
    return { text: 'DECODED', color: 'green', agentEmoji: '🎖️', agentMessage: '解码成功！', agentTheme: 'friendly' };
  }

  // Fallback: intercept attempted but failed, decrypt result unknown
  if (intercept_success === false) {
    return { text: 'SECURE', color: 'green', agentEmoji: '🛡️', agentMessage: '拦截失败，通讯安全', agentTheme: 'friendly' };
  }

  return { text: 'PROCESSING', color: 'red', agentEmoji: '⏳', agentMessage: '处理结果中…', agentTheme: 'friendly' };
}

export default function RoundResult() {
  const { roundResult, round } = useGameStore();

  const stamp = getStampConfig(roundResult);

  return (
    <div
      className="relative w-full h-full overflow-hidden flex items-center justify-center"
      style={{
        background: `linear-gradient(180deg, ${rawColors.navyDark} 0%, ${rawColors.bgDark} 100%)`,
      }}
    >
      <DossierEffectLayer />

      <div className="relative z-10 flex flex-col items-center gap-5 px-6 w-full max-w-sm">
        {/* Round label */}
        <p
          className="text-xs tracking-widest"
          style={{
            fontFamily: "'Courier Prime', monospace",
            color: rawColors.brassDim,
            letterSpacing: '3px',
          }}
        >
          第 {round} 轮结果
        </p>

        {/* Result stamp */}
        <div className="flex justify-center">
          <RubberStamp
            text={stamp.text}
            color={stamp.color}
            size="large"
            rotation={-4}
            animated
          />
        </div>

        {/* Scoreboard */}
        <ScoreBoard />

        {/* Next round notice */}
        <p
          className="text-xs"
          style={{
            fontFamily: "'Special Elite', cursive",
            color: rawColors.brassDim,
            marginTop: '4px',
          }}
        >
          下一轮即将开始…
        </p>

        {/* Agent panel */}
        <div className="w-full">
          <AgentPanel
            emoji={stamp.agentEmoji}
            message={stamp.agentMessage}
            theme={stamp.agentTheme}
          />
        </div>
      </div>
    </div>
  );
}
