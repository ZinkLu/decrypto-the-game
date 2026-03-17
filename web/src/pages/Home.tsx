import { rawColors } from '../theme/colors';
import { ManilaFolder, RubberStamp, TypewriterText, DossierButton, WaxSeal, DossierEffectLayer } from '../components/dossier';

export default function Home() {
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
      <div className="relative z-10 flex items-center justify-center h-full p-6">
        <ManilaFolder tabLabel="CLASSIFIED" className="max-w-lg w-full">
          {/* Top secret stamp */}
          <div className="flex justify-between items-start mb-6">
            <WaxSeal size="medium" />
            <RubberStamp text="TOP SECRET" color="red" size="medium" rotation={-4} />
          </div>

          {/* Title */}
          <div className="text-center mb-6">
            <TypewriterText text="OPERATION: DECRYPTO" size="large" color="dark" as="h1" />
            <div
              className="mt-2"
              style={{
                fontFamily: "'Noto Serif SC', serif",
                fontSize: '1rem',
                color: rawColors.inkBlack,
                opacity: 0.7,
              }}
            >
              团队暗号破解通信系统
            </div>
          </div>

          {/* Divider */}
          <div
            className="mx-8 my-4 border-t border-dashed"
            style={{ borderColor: rawColors.creamDark }}
          />

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <DossierButton variant="primary" size="large">
              CREATE ROOM
            </DossierButton>

            <DossierButton variant="secondary" size="large">
              JOIN ROOM
            </DossierButton>
          </div>

          {/* Status panel */}
          <div
            className="flex items-center justify-center gap-4 mt-6 p-3 rounded"
            style={{
              backgroundColor: rawColors.creamDark,
              border: `1px solid ${rawColors.brass}40`,
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="text-xs"
                style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.inkBlack }}
              >
                STATUS:
              </span>
              <span
                className="text-xs font-bold"
                style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.teamFriendly }}
              >
                CONNECTED
              </span>
            </div>
            <div className="w-px h-4" style={{ backgroundColor: rawColors.brass }} />
            <div className="flex items-center gap-2">
              <span
                className="text-xs"
                style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.inkBlack }}
              >
                CLEARANCE:
              </span>
              <span
                className="text-xs font-bold"
                style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brass }}
              >
                LEVEL 5
              </span>
            </div>
          </div>

          {/* Bottom prompt */}
          <div className="mt-6 text-center">
            <span
              className="text-sm italic"
              style={{
                fontFamily: "'Courier Prime', monospace",
                color: rawColors.inkBlack,
                opacity: 0.5,
              }}
            >
              Awaiting operative instructions...
            </span>
          </div>
        </ManilaFolder>
      </div>
    </div>
  );
}
