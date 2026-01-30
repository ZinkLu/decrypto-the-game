import { TensionLevel, encryptorTensionConfig, rawColors } from '../../theme/colors';

interface MascotPanelProps {
  tension?: TensionLevel;
  className?: string;
  emoji?: string;
  message?: string;
  position?: 'bottom' | 'side';
}

/**
 * Mascot panel component
 * Displays mascot expression and status message based on tension level
 */
export function MascotPanel({
  tension = 'normal',
  className = '',
  emoji: customEmoji,
  message: customMessage,
  position = 'bottom',
}: MascotPanelProps) {
  const config = encryptorTensionConfig[tension];
  const displayEmoji = customEmoji || config.emoji;
  const displayMessage = customMessage || config.message;

  const isBottom = position === 'bottom';

  // Get raw text color
  const getTextColor = () => {
    switch (tension) {
      case 'normal':
        return rawColors.tensionNormalText;
      case 'warning':
        return rawColors.tensionWarningText;
      case 'tense':
        return rawColors.tensionTenseText;
      case 'critical':
        return rawColors.tensionCriticalText;
      default:
        return rawColors.tensionNormalText;
    }
  };

  const textColor = getTextColor();

  return (
    <div
      className={`${isBottom ? 'absolute bottom-0 left-0 right-0' : ''} z-10 ${className}`}
      style={isBottom ? { height: '15%', minHeight: '100px' } : {}}
    >
      {/* CRT border */}
      <div
        className={`absolute inset-0 ${isBottom ? 'rounded-t-lg' : 'rounded-lg'}`}
        style={{
          background: `linear-gradient(145deg, ${rawColors.panel}, ${rawColors.metalDark})`,
          borderTop: isBottom ? `4px solid ${rawColors.metal}` : undefined,
          border: !isBottom ? `4px solid ${rawColors.metal}` : undefined,
        }}
      />

      {/* CRT screen inner */}
      <div
        className={`absolute ${isBottom ? 'inset-x-4 bottom-2 top-2' : 'inset-2'} rounded overflow-hidden`}
        style={{
          background: rawColors.bgDark,
          border: `2px solid ${rawColors.bgBase}`,
        }}
      >
        {/* Mascot content */}
        <div className="relative z-10 flex flex-col items-center justify-center h-full">
          {/* Expression */}
          <div
            className="text-4xl"
            style={{
              color: textColor,
            }}
          >
            {displayEmoji}
          </div>

          {/* Status text */}
          <span
            className="text-sm mt-1"
            style={{
              fontFamily: "'VT323', monospace",
              color: textColor,
            }}
          >
            {displayMessage}
          </span>
        </div>
      </div>
    </div>
  );
}

export default MascotPanel;
