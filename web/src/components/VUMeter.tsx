import { motion } from 'framer-motion';

interface VUMeterProps {
  value: number; // 0-100
  label?: string;
  orientation?: 'horizontal' | 'vertical';
  color?: 'green' | 'amber' | 'red';
}

export function VUMeter({
  value = 0,
  label,
  orientation = 'vertical',
  color = 'green'
}: VUMeterProps) {
  // Clamp value between 0 and 100
  const clampedValue = Math.max(0, Math.min(100, value));

  // Convert value to angle (-45deg to +45deg)
  const angle = -45 + (clampedValue / 100) * 90;

  const colorClasses = {
    green: 'bg-[#00ff88] shadow-[0_0_10px_#00ff88]',
    amber: 'bg-[#ffaa00] shadow-[0_0_10px_#ffaa00]',
    red: 'bg-[#ff4444] shadow-[0_0_10px_#ff4444]'
  };

  return (
    <div className="flex items-center gap-3">
      {orientation === 'vertical' ? (
        <div className="flex gap-2">
          {/* Scale marks */}
          <div className="vu-scale">
            <div className="vu-mark red" style={{ width: '30px' }} />
            <div className="vu-mark red" style={{ width: '30px' }} />
            <div className="vu-mark amber" style={{ width: '30px' }} />
            <div className="vu-mark amber" style={{ width: '30px' }} />
            <div className="vu-mark green" style={{ width: '30px' }} />
            <div className="vu-mark green" style={{ width: '30px' }} />
            <div className="vu-mark green" style={{ width: '30px' }} />
          </div>

          {/* Needle display */}
          <div className="vu-needle-container" style={{ width: '50px', height: '80px' }}>
            {/* Arc background */}
            <svg
              viewBox="0 0 50 45"
              style={{ position: 'absolute', bottom: 0, left: 0, width: '50px', height: '45px' }}
            >
              <path
                d="M 5 40 A 35 35 0 0 1 45 40"
                fill="none"
                stroke="#1a2a1a"
                strokeWidth="2"
              />
            </svg>

            {/* Needle */}
            <motion.div
              className={`vu-needle ${colorClasses[color]}`}
              animate={{ rotate: angle }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              style={{
                transformOrigin: 'bottom center',
                bottom: '5px'
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {/* Horizontal meter */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#00ff88] font-mono">-∞</span>
            <div className="relative h-4 bg-[#1a1a1a] rounded" style={{ width: '120px' }}>
              {/* Scale marks */}
              <div className="absolute inset-0 flex items-center">
                <div className="h-full flex-1 bg-[#00ff88]" style={{ width: `${clampedValue}%` }} />
                <div className="h-full flex-1 bg-[#2a2a2a]" />
              </div>

              {/* Needle/indicator */}
              <motion.div
                className={`absolute top-0 w-1 h-full ${colorClasses[color]}`}
                animate={{ left: `${clampedValue}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            </div>
            <span className="text-[10px] text-[#00ff88] font-mono">0</span>
          </div>
        </div>
      )}

      {label && (
        <span className="text-[10px] text-[#ffaa00] font-mono uppercase tracking-wider">
          {label}
        </span>
      )}
    </div>
  );
}

// Stereo VU meter with two channels
interface StereoVUMeterProps {
  leftValue: number;
  rightValue: number;
  label?: string;
}

export function StereoVUMeter({ leftValue, rightValue, label }: StereoVUMeterProps) {
  return (
    <div className="flex items-center gap-4">
      {label && (
        <span className="text-[10px] text-[#ffaa00] font-mono uppercase tracking-wider w-16">
          {label}
        </span>
      )}

      <div className="flex gap-6">
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-[#00ff88] font-mono">L</span>
          <VUMeter value={leftValue} orientation="vertical" color="green" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-[#00ff88] font-mono">R</span>
          <VUMeter value={rightValue} orientation="vertical" color="green" />
        </div>
      </div>
    </div>
  );
}
