import { rawColors } from '../../theme/colors';

interface AgentPanelProps {
  emoji: string;
  message: string;
  theme?: 'friendly' | 'enemy';
  className?: string;
  children?: React.ReactNode;
}

export function AgentPanel({
  emoji,
  message,
  theme = 'friendly',
  className = '',
  children,
}: AgentPanelProps) {
  const isFriendly = theme === 'friendly';
  const bgColor = isFriendly ? rawColors.navyLight : rawColors.opponentCrtScreen;
  const borderColor = isFriendly ? rawColors.teamFriendlyDim : rawColors.opponentNormalBorder;
  const textColor = isFriendly ? rawColors.teamFriendly : rawColors.teamEnemy;

  return (
    <div
      className={`w-full max-w-md mx-auto p-4 rounded-lg ${className}`}
      style={{
        background: bgColor,
        border: `2px solid ${borderColor}`,
        boxShadow: `0 2px 8px rgba(0,0,0,0.3)`,
      }}
    >
      <div className="flex flex-col items-center justify-center" aria-live="polite">
        {children}

        {/* Emoji */}
        <div className="text-2xl" aria-hidden="true">
          {emoji}
        </div>

        {/* Status text */}
        <span
          className="text-sm mt-1"
          style={{
            fontFamily: "'Special Elite', cursive",
            color: textColor,
          }}
        >
          {message}
        </span>
      </div>
    </div>
  );
}

export default AgentPanel;
