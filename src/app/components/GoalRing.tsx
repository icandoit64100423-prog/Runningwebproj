export function GoalRing({ value, goal }: { value: number; goal: number }) {
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const size = 160, stroke = 14, r = (size - stroke) / 2, C = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} stroke="#f3f3f0" strokeWidth={stroke} fill="none" />
        <circle cx={size/2} cy={size/2} r={r} stroke="#f97316" strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
          style={{ transition: "stroke-dashoffset 600ms ease" }} />
      </svg>
      <div>
        <div className="text-xs uppercase tracking-widest text-orange-600">Weekly goal</div>
        <div className="flex items-baseline gap-1 mt-1">
          <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 42, lineHeight: 1 }}>
            {value.toFixed(1)}
          </span>
          <span className="text-neutral-400 text-sm">/ {goal} km</span>
        </div>
        <div className="text-sm text-neutral-500 mt-1">
          {pct >= 1 ? "🎯 목표 달성!" : `${Math.round(pct * 100)}% 진행 중`}
        </div>
      </div>
    </div>
  );
}
