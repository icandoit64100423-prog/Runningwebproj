export function Sunburst({ className = "" }: { className?: string }) {
  const rays = 90;
  const lines = Array.from({ length: rays }, (_, i) => {
    const angle = (i * 360) / rays;
    const isLong = i % 3 === 0;
    return { angle, length: isLong ? 28 : 16, opacity: isLong ? 0.55 : 0.28 };
  });
  return (
    <svg viewBox="-200 -200 400 400" className={className} aria-hidden>
      <circle r="170" fill="none" stroke="#f4a87333" strokeDasharray="1 6" strokeWidth="1" />
      {lines.map((l, i) => {
        const rad = (l.angle * Math.PI) / 180;
        const x1 = Math.cos(rad) * 180;
        const y1 = Math.sin(rad) * 180;
        const x2 = Math.cos(rad) * (180 + l.length);
        const y2 = Math.sin(rad) * (180 + l.length);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#f97316"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity={l.opacity}
          />
        );
      })}
    </svg>
  );
}
