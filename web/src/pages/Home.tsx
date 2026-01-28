import { motion } from 'framer-motion';
import { OscilloscopeBackground } from '../components/OscilloscopeBackground';
import { PhosphorText } from '../components/PhosphorText';
import { CRTTypeWriter } from '../components/CRTTypeWriter';
import { Oscilloscope } from '../components/Oscilloscope';
import { VUMeter, StereoVUMeter } from '../components/VUMeter';

export default function Home() {
  return (
    <div className="relative w-full h-full overflow-hidden bg-[#1a1a1a]">
      {/* Oscilloscope Background */}
      <OscilloscopeBackground speed={0.8} density={30} color="#00ff88" />

      {/* CRT Scanlines Overlay */}
      <div className="crt-scanlines" />

      {/* Main Panel */}
      <div className="relative z-10 flex items-center justify-center h-full p-8">
        {/* Physical Device Frame */}
        <div className="crt-screen" style={{ maxWidth: '800px', width: '100%' }}>
          {/* Corner screws */}
          <div className="absolute -top-1 -left-1 z-20">
            <div className="screw" />
          </div>
          <div className="absolute -top-1 -right-1 z-20">
            <div className="screw" />
          </div>
          <div className="absolute -bottom-1 -left-1 z-20">
            <div className="screw" />
          </div>
          <div className="absolute -bottom-1 -right-1 z-20">
            <div className="screw" />
          </div>

          {/* Inner CRT Screen */}
          <div className="crt-screen-inner p-6">
            {/* Device label plate */}
            <div
              className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#1a1a1a] px-4 py-1 rounded border border-[#3a3a3a]"
              style={{ fontFamily: "'VT323', monospace" }}
            >
              <span className="text-[#ffaa00] text-sm tracking-widest">
                MODEL DC-9000 // ENCRYPTION TERMINAL
              </span>
            </div>

            {/* Main Content */}
            <div className="flex flex-col items-center gap-8 mt-8">
              {/* Title with Phosphor Effect */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="text-center"
              >
                <PhosphorText text="DECRYPTO" size="large" color="green" />
                <div className="mt-2">
                  <CRTTypeWriter
                    text="团队暗号破解通信系统"
                    speed={60}
                    delay={300}
                    cursorColor="#00ff88"
                  />
                </div>
              </motion.div>

              {/* Decorative oscilloscope */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.3 }}
              >
                <Oscilloscope width={300} height={60} speed={0.5} color="#00ff88" />
              </motion.div>

              {/* Signal meters */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex gap-8"
              >
                <StereoVUMeter leftValue={75} rightValue={68} label="SIGNAL" />
                <VUMeter value={82} label="POWER" color="amber" />
              </motion.div>

              {/* Action Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.6 }}
                className="flex flex-col sm:flex-row gap-6 mt-4"
              >
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="panel-button friendly"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <span className="indicator-light on" />
                    CREATE ROOM
                  </span>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="panel-button"
                  style={{ border: '2px solid #ffaa00' }}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <span className="indicator-light on amber" />
                    JOIN ROOM
                  </span>
                </motion.button>
              </motion.div>

              {/* Status panel */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="flex items-center gap-4 mt-4 p-3 bg-[#0a0f0a] rounded border border-[#3d5544]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[#00ff88] text-xs font-mono">STATUS:</span>
                  <span className="text-[#00ff88] text-xs font-mono blink">CONNECTED</span>
                </div>
                <div className="w-px h-4 bg-[#3d5544]" />
                <div className="flex items-center gap-2">
                  <span className="text-[#ffaa00] text-xs font-mono">ENC:</span>
                  <span className="text-[#ffaa00] text-xs font-mono">AES-256</span>
                </div>
                <div className="w-px h-4 bg-[#3d5544]" />
                <div className="flex items-center gap-2">
                  <span className="text-[#ffaa00] text-xs font-mono">VER:</span>
                  <span className="text-[#ffaa00] text-xs font-mono">2.0.1</span>
                </div>
              </motion.div>

              {/* Bottom prompt */}
              <motion.div
                className="absolute bottom-6 left-1/2 -translate-x-1/2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5 }}
              >
                <span
                  className="text-[#ffaa00] text-sm font-mono"
                  style={{ textShadow: '0 0 5px #ffaa00' }}
                >
                  Press any key to continue_
                </span>
              </motion.div>
            </div>

            {/* Corner frame decorations */}
            <div className="frame-corner tl" />
            <div className="frame-corner tr" />
            <div className="frame-corner bl" />
            <div className="frame-corner br" />
          </div>
        </div>
      </div>

      {/* Side panel decorations */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-4">
        <div className="w-2 h-32 panel-grille rounded" />
        <div className="w-2 h-32 panel-grille rounded" />
      </div>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-4">
        <div className="w-2 h-32 panel-grille rounded" />
        <div className="w-2 h-32 panel-grille rounded" />
      </div>
    </div>
  );
}
