import { waveConfig, rawColors } from '../theme/colors';

export type OscilloscopeState = 'active' | 'completed' | 'waiting' | 'boot';

interface WaveformWindowProps {
  index: number;
  state: OscilloscopeState;
  statusText: string;
  showCheckmark?: boolean;
  width?: number;
  height?: number;
  onBootComplete?: () => void;
}

/**
 * Simplified waveform window component - shows status indicator
 */
export function WaveformWindow({
  index,
  state,
  statusText,
  showCheckmark = false,
  width = 200,
  height = 80,
}: WaveformWindowProps) {
  // Get config for state (boot uses waiting config)
  const config = state === 'boot' ? waveConfig['waiting'] : waveConfig[state];

  // Get display for state
  const getStateDisplay = () => {
    switch (state) {
      case 'active':
        return '...';
      case 'completed':
        return '✓';
      case 'waiting':
      case 'boot':
        return '—';
      default:
        return '—';
    }
  };

  return (
    <div className="flex flex-col items-center">
      {/* Status box */}
      <div
        className="rounded flex items-center justify-center"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          background: rawColors.crtScreen,
          border: `2px solid ${config.borderColor}`,
        }}
      >
        <span
          className="text-2xl font-mono"
          style={{
            fontFamily: "'VT323', monospace",
            color: config.color,
          }}
        >
          {getStateDisplay()}
        </span>
      </div>

      {/* Label */}
      <div className="mt-2 text-center">
        <div
          className="text-sm font-mono"
          style={{
            fontFamily: "'VT323', monospace",
            color: config.color,
          }}
        >
          #{index} {showCheckmark && '✓'}
        </div>
        <div
          className="text-xs font-mono opacity-70"
          style={{
            fontFamily: "'VT323', monospace",
            color: config.color,
          }}
        >
          {statusText}
        </div>
      </div>
    </div>
  );
}

export default WaveformWindow;
