import { motion } from 'framer-motion';
import { PhosphorText } from '../PhosphorText';
import { TensionLevel, tensionConfig, rawColors } from '../../theme/colors';

interface CountdownHeaderProps {
  timeLeft: number;
  totalTime?: number;
  tension?: TensionLevel;
  showProgressBar?: boolean;
  className?: string;
  // Customization
  formatTime?: (seconds: number) => string;
  progressBarHeight?: number;
}

/**
 * 默认时间格式化函数
 */
function defaultFormatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 顶部倒计时区域组件
 * 显示时间、进度条和紧张度视觉反馈
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
  const config = tensionConfig[tension];
  const progress = (timeLeft / totalTime) * 100;

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Time display */}
      <div className="flex items-center gap-4">
        <PhosphorText
          text={formatTime(timeLeft)}
          size="large"
          color={tension === 'critical' ? 'amber' : 'green'}
          glowIntensity={tension === 'critical' ? 1.5 : 1}
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
          <motion.div
            className="h-full rounded-full"
            style={{
              backgroundColor: config.progressBar,
              boxShadow: `0 0 10px ${config.progressBar}`,
            }}
            initial={{ width: '100%' }}
            animate={{
              width: `${progress}%`,
              filter:
                tension === 'critical' ? 'brightness(1.5)' : 'brightness(1)',
            }}
            transition={{ duration: 1, ease: 'linear' }}
          />
        </div>
      )}
    </div>
  );
}

export default CountdownHeader;
