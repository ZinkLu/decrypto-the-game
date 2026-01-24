import { motion } from 'framer-motion';
import { MatrixRain } from '../components/MatrixRain';
import { GlitchText } from '../components/GlitchText';
import { TypeWriter } from '../components/TypeWriter';

export default function Home() {
  return (
    <div className="relative w-full h-full overflow-hidden bg-cyber-black">
      {/* Matrix Rain Background */}
      <MatrixRain speed={35} density={20} color="#00ff9f" />

      {/* Scanline Overlay */}
      <div className="scanline-overlay" />

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-4">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="text-center mb-12"
        >
          <GlitchText text="DECRYPTO" size="large" />
          <div className="mt-4">
            <TypeWriter
              text="团队暗号破解游戏"
              speed={80}
              delay={500}
            />
          </div>
        </motion.div>

        {/* Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: 'easeOut' }}
          className="flex flex-col gap-4 sm:flex-row"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="cyber-button group"
          >
            <span className="relative z-10">CREATE ROOM</span>
            <motion.div
              className="absolute inset-0 bg-cyber-primary/20"
              initial={{ x: '-100%' }}
              whileHover={{ x: '100%' }}
              transition={{ duration: 0.5 }}
            />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="cyber-button border-cyber-secondary text-cyber-secondary hover:border-cyber-secondary"
            style={{
              '--tw-border-color': '#00d4ff'
            } as React.CSSProperties}
          >
            <span className="relative z-10">JOIN ROOM</span>
          </motion.button>
        </motion.div>

        {/* Decorative Elements */}
        <motion.div
          className="absolute bottom-8 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
        >
          <p className="text-cyber-dark-secondary text-sm font-mono">
            Press any key to continue...
          </p>
        </motion.div>
      </div>

      {/* Corner Decorations */}
      <div className="absolute top-4 left-4 w-16 h-16 border-l-2 border-t-2 border-cyber-primary/50" />
      <div className="absolute top-4 right-4 w-16 h-16 border-r-2 border-t-2 border-cyber-secondary/50" />
      <div className="absolute bottom-4 left-4 w-16 h-16 border-l-2 border-b-2 border-cyber-accent/50" />
      <div className="absolute bottom-4 right-4 w-16 h-16 border-r-2 border-b-2 border-cyber-primary/50" />
    </div>
  );
}
