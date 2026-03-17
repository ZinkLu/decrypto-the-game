import { ReactNode } from 'react';
import { rawColors } from '../../theme/colors';

interface ManilaFolderProps {
  tabLabel?: string;
  children: ReactNode;
  className?: string;
}

export function ManilaFolder({
  tabLabel = 'CLASSIFIED',
  children,
  className = '',
}: ManilaFolderProps) {
  return (
    <div className={`relative ${className}`}>
      {/* Folder tab */}
      <div className="relative inline-block ml-6">
        <div
          className="px-6 py-1 rounded-t-md"
          style={{
            background: '#C4A66A',
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '0.75rem',
            letterSpacing: '3px',
            color: rawColors.inkBlack,
            textTransform: 'uppercase',
            boxShadow: '0 -2px 4px rgba(0,0,0,0.1)',
          }}
        >
          {tabLabel}
        </div>
      </div>

      {/* Folder body */}
      <div
        className="relative rounded-lg rounded-tl-none p-6"
        style={{
          background: 'linear-gradient(180deg, #C4A66A 0%, #B8975A 100%)',
          boxShadow: '3px 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
      >
        {/* Inner paper area */}
        <div
          className="rounded p-6"
          style={{
            backgroundColor: rawColors.bgPaper,
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100\' height=\'100\' filter=\'url(%23n)\' opacity=\'0.04\'/%3E%3C/svg%3E")',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.15)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default ManilaFolder;
