import { PhosphorText } from '../PhosphorText';
import { TensionLevel, rawColors } from '../../theme/colors';

interface CountdownHeaderProps {
  timeLeft: number;
  totalTime?: number;
  tension?: TensionLevel;
  showProgressBar?: boolean;
  className?: string;
  formatTime?: (seconds: number) => string;
  progressBarHeight?: number;
}

/**
 * Default time format function
 */
function defaultFormatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Top countdown area component
 */
export function CountdownHeader({
  timeLeft,
  totalTime = 90,
  tension = 'normal',
  showProgressBar = true,
  className = '',
  formatTime = defaultFormatTime,
  progressBarHeight = 8,
}: CountdownHeaderProps) {
  const progress = (timeLeft / totalTime) * 100;

  // Get raw color for progress bar
  const getProgressBarColor = () => {
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

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Time display */}
      <div className="flex items-center gap-4">
        <PhosphorText
          text={formatTime(timeLeft)}
          size="large"
          color={tension === 'critical' ? 'amber' : 'green'}
        />
      </div>

      {/* Progress bar */}
      {showProgressBar && (
        <div
          className="w-64 mt-3 rounded-full overflow-hidden border"
          style={{
            height: `${progressBarHeight}px`,
            backgroundColor: rawColors.bgBase,
            borderColor: rawColors.panel,
          }}
        >
          <div
            className="h-full rounded-full transition-[width,background-color] duration-1000"
            style={{
              backgroundColor: getProgressBarColor(),
              width: `${progress}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

export default CountdownHeader;
