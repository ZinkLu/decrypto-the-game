interface CRTTypeWriterProps {
  text: string;
  cursorColor?: string;
}

export function CRTTypeWriter({
  text,
  cursorColor = '#00ff88'
}: CRTTypeWriterProps) {
  return (
    <span
      className="font-mono"
      style={{
        fontFamily: "'VT323', 'Courier New', monospace",
        color: cursorColor,
      }}
    >
      {text}
    </span>
  );
}
