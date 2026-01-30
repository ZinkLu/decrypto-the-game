import { PhosphorText } from '../components/PhosphorText';
import { colors, rawColors } from '../theme/colors';

export default function Home() {
  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ backgroundColor: colors.bgBase }}
    >
      {/* Main Panel */}
      <div className="relative z-10 flex items-center justify-center h-full p-8">
        {/* Device Frame */}
        <div
          className="rounded-lg p-6"
          style={{
            maxWidth: '800px',
            width: '100%',
            background: `linear-gradient(145deg, #2a2a2a, #1a1a1a)`,
            border: `3px solid ${rawColors.teamFriendlyDim}`,
          }}
        >
          {/* Device label plate */}
          <div
            className="mx-auto mb-6 px-4 py-1 rounded border text-center"
            style={{
              fontFamily: "'VT323', monospace",
              backgroundColor: rawColors.deviceLabelBg,
              borderColor: rawColors.deviceLabelBorder,
              width: 'fit-content',
            }}
          >
            <span
              className="text-sm tracking-widest"
              style={{ color: rawColors.crtAmber }}
            >
              MODEL DC-9000 // ENCRYPTION TERMINAL
            </span>
          </div>

          {/* Main Content */}
          <div className="flex flex-col items-center gap-8">
            {/* Title */}
            <div className="text-center">
              <PhosphorText text="DECRYPTO" size="large" color="green" />
              <div
                className="mt-2 font-mono"
                style={{
                  fontFamily: "'VT323', 'Courier New', monospace",
                  color: rawColors.crtPhosphor,
                }}
              >
                团队暗号破解通信系统
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-6 mt-4">
              <button
                className="px-6 py-3 rounded font-bold text-lg"
                style={{
                  fontFamily: "'VT323', monospace",
                  background: rawColors.teamFriendlyDim,
                  color: rawColors.crtPhosphor,
                  border: `2px solid ${rawColors.crtPhosphor}`,
                }}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: rawColors.crtPhosphor }}
                  />
                  CREATE ROOM
                </span>
              </button>

              <button
                className="px-6 py-3 rounded font-bold text-lg"
                style={{
                  fontFamily: "'VT323', monospace",
                  background: rawColors.crtAmberDim,
                  color: rawColors.crtAmber,
                  border: `2px solid ${rawColors.crtAmber}`,
                }}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: rawColors.crtAmber }}
                  />
                  JOIN ROOM
                </span>
              </button>
            </div>

            {/* Status panel */}
            <div
              className="flex items-center gap-4 mt-4 p-3 rounded border"
              style={{
                backgroundColor: rawColors.bgDark,
                borderColor: rawColors.teamFriendlyDim,
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-mono"
                  style={{ color: rawColors.crtPhosphor }}
                >
                  STATUS:
                </span>
                <span
                  className="text-xs font-mono"
                  style={{ color: rawColors.statusConnected }}
                >
                  CONNECTED
                </span>
              </div>
              <div
                className="w-px h-4"
                style={{ backgroundColor: rawColors.teamFriendlyDim }}
              />
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-mono"
                  style={{ color: rawColors.crtAmber }}
                >
                  ENC:
                </span>
                <span
                  className="text-xs font-mono"
                  style={{ color: rawColors.crtAmber }}
                >
                  AES-256
                </span>
              </div>
              <div
                className="w-px h-4"
                style={{ backgroundColor: rawColors.teamFriendlyDim }}
              />
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-mono"
                  style={{ color: rawColors.crtAmber }}
                >
                  VER:
                </span>
                <span
                  className="text-xs font-mono"
                  style={{ color: rawColors.crtAmber }}
                >
                  2.0.1
                </span>
              </div>
            </div>

            {/* Bottom prompt */}
            <div className="mt-4">
              <span
                className="text-sm font-mono"
                style={{
                  color: rawColors.crtAmber,
                }}
              >
                Press any key to continue_
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
