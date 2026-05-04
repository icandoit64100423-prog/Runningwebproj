import { useMemo, useState } from "react";
import { api, type Run, type Profile } from "../lib/api";
import { toast } from "sonner";
import { GoalRing } from "./GoalRing";
import { computePRs, paceSecToStr, trainingLoadSeries, weeklyKm } from "../lib/analytics";
import { RUN_TYPES, runTypeLabel, type RunTypeKey } from "../lib/runTypes";

function formatPace(totalMinutes: number, km: number): string {
  if (!km || km <= 0) return "--'--\"";
  const secPerKm = (totalMinutes * 60) / km;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${String(m).padStart(2, "0")}'${String(s).padStart(2, "0")}"`;
}

function computeStreak(runs: Run[]): number {
  if (!runs.length) return 0;
  const set = new Set(runs.map((r) => r.date));
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 366; i++) {
    const key = d.toISOString().slice(0, 10);
    if (set.has(key)) { streak++; d.setDate(d.getDate() - 1); }
    else if (i === 0) { d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

function weeklyData(runs: Run[]) {
  const buckets = new Map<string, number>();
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  runs.forEach((r) => {
    if (buckets.has(r.date)) buckets.set(r.date, (buckets.get(r.date) || 0) + r.distance);
  });
  return Array.from(buckets.entries()).map(([date, km]) => ({
    label: date.slice(5), km: Number(km.toFixed(1)),
  }));
}


const getRpeLevel = (rpe: number) => {
  if (rpe >= 1 && rpe <= 4) return { label: "Low", desc: "회복 / 저강도", color: "text-blue-600" };
  if (rpe >= 5 && rpe <= 7) return { label: "Moderate", desc: "중간 강도", color: "text-yellow-600" };
  return { label: "High", desc: "고강도", color: "text-red-600" };
};

export function RecordPage({
  runs, onCreated, profile,
}: { runs: Run[]; onCreated: () => void; profile: Profile }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [distance, setDistance] = useState<number>(5.0);
  const [time, setTime] = useState<number>(30);
  const [type, setType] = useState<RunTypeKey>("jogging");
  const [rpe, setRpe] = useState(5);
  const [calories, setCalories] = useState<number>(Number((profile.weight_kg * 5 * 1.036).toFixed(1)));
  const [saving, setSaving] = useState(false);

  const pace = useMemo(() => formatPace(time, distance), [time, distance]);

  const onDistanceChange = (v: number) => {
    setDistance(v);
    setCalories(Number((profile.weight_kg * v * 1.036).toFixed(1)));
  };

  const submit = async () => {
    if (!date || !distance || !time) { toast.error("날짜, 거리, 시간을 모두 입력해주세요."); return; }
    setSaving(true);
    try {
      await api.createRun({ date, distance: Number(distance.toFixed(1)), time, pace, calories, type, rpe });
      toast.success("러닝 기록 저장 완료");
      onCreated();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const removeRun = async (id: string) => {
    if (!confirm("이 기록을 삭제하시겠습니까?")) return;
    try { await api.deleteRun(id); toast.success("삭제되었습니다."); onCreated(); }
    catch (e: any) { toast.error(e.message); }
  };

  const totalKm = runs.reduce((s, r) => s + (r.distance || 0), 0);
  const totalMin = runs.reduce((s, r) => s + (r.time || 0), 0);
  const streak = computeStreak(runs);
  const weekly = weeklyData(runs);
  const weekKm = weeklyKm(runs);
  const loadSeries = trainingLoadSeries(runs, 14);
  const { prs, labels } = computePRs(runs);

  return (
    <div className="space-y-8">
      {/* Hero metrics: goal ring + stats */}
      <div className="bg-white rounded-3xl border border-neutral-200 p-8 shadow-sm grid md:grid-cols-[auto_1fr] gap-8 items-center">
        <GoalRing value={weekKm} goal={profile.weekly_goal_km} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Total" value={`${runs.length}`} unit="runs" />
          <Stat label="Distance" value={totalKm.toFixed(1)} unit="km" />
          <Stat label="Streak" value={`${streak}`} unit="days" />
          <Stat label="Avg RPE" value={runs.length ? (runs.reduce((s, r) => s + r.rpe, 0) / runs.length).toFixed(1) : "—"} unit="/10" />
        </div>
      </div>

      {/* Personal Records */}
      <div className="bg-white rounded-3xl border border-neutral-200 p-8 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-xs uppercase tracking-widest text-orange-600">Personal Records</div>
            <h3 className="text-2xl tracking-tight mt-1">나의 최고 기록 🏆</h3>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <PrBadge label="Longest" value={prs.longest ? `${prs.longest.toFixed(1)} km` : "—"} />
          <PrBadge label="Best Pace" value={prs.bestPaceSec ? paceSecToStr(prs.bestPaceSec) : "—"} />
          {labels.map((l) => {
            const r = (prs as any)[l.key] as Run | undefined;
            const paceSec = r ? (r.time * 60) / r.distance * (l.min / l.min) : null;
            const effective = r ? (r.time * 60 * l.min) / r.distance : null;
            return (
              <PrBadge
                key={l.key}
                label={l.label}
                value={effective ? paceSecToStr(effective / l.min) : "—"}
                sub={r ? `${r.distance.toFixed(1)}km · ${r.date}` : undefined}
              />
            );
          })}
        </div>
      </div>

      {/* Weekly trend */}
      <div className="bg-white rounded-3xl border border-neutral-200 p-8 shadow-sm">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-orange-600">Last 7 days</div>
            <h3 className="text-2xl tracking-tight mt-1">주간 거리 추이</h3>
          </div>
          <div className="text-right">
            <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 36, lineHeight: 1 }}>{weekKm.toFixed(1)}</div>
            <div className="text-xs text-neutral-400">km this week</div>
          </div>
        </div>
        <TrendLine data={weekly.map((d) => ({ label: d.label, value: d.km }))} unit="km" />
      </div>

      {/* Pace + load */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-white rounded-3xl border border-neutral-200 p-8 shadow-sm">
          <div className="text-xs uppercase tracking-widest text-orange-600">Pace (14d)</div>
          <h3 className="text-xl tracking-tight mt-1 mb-3">페이스 추이</h3>
          <TrendLine
            data={loadSeries.map((d) => ({ label: d.label, value: d.pace ?? 0, empty: d.pace == null }))}
            unit=""
            formatter={(v) => v ? paceSecToStr(v) : "—"}
            color="#0ea5e9"
            invert
          />
        </div>
        <div className="bg-white rounded-3xl border border-neutral-200 p-8 shadow-sm">
          <div className="text-xs uppercase tracking-widest text-orange-600">Training Load (14d)</div>
          <h3 className="text-xl tracking-tight mt-1 mb-3">훈련 부하 (RPE × 시간)</h3>
          <TrendLine
            data={loadSeries.map((d) => ({ label: d.label, value: d.load }))}
            unit="pts"
            color="#8b5cf6"
          />
        </div>
      </div>

      {/* Entry + history */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="bg-white rounded-3xl border border-neutral-200 p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-xs uppercase tracking-widest text-orange-600">New entry</div>
              <h2 className="text-2xl tracking-tight mt-1">Log today's run</h2>
            </div>
            <div className="bg-neutral-900 text-white rounded-2xl px-4 py-3 text-right">
              <div className="text-[10px] uppercase tracking-widest opacity-60">Pace</div>
              <div className="text-2xl" style={{ fontFamily: "'Instrument Serif', serif" }}>{pace}</div>
            </div>
          </div>
          <div className="space-y-5">
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-transparent outline-none" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Distance (km)">
                <input type="number" step="0.1" min={0} value={distance}
                  onChange={(e) => onDistanceChange(parseFloat(e.target.value) || 0)}
                  className="w-full bg-transparent outline-none" />
              </Field>
              <Field label="Time (min)">
                <input type="number" min={0} value={time}
                  onChange={(e) => setTime(parseInt(e.target.value) || 0)}
                  className="w-full bg-transparent outline-none" />
              </Field>
            </div>
            <div>
              <div className="flex justify-between text-xs uppercase tracking-wider text-neutral-500 mb-2">
                <span>Type</span>
                <span className="text-orange-600 normal-case tracking-normal">
                  {RUN_TYPES.find((t) => t.key === type)?.desc}
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                {RUN_TYPES.map((t) => (
                  <button key={t.key} onClick={() => setType(t.key)}
                    className={`shrink-0 px-4 py-2 rounded-full text-sm border transition ${
                      type === t.key ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400"
                    }`}>{t.label}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs uppercase tracking-wider text-neutral-500 mb-2">
                <span>RPE · 주관적 강도</span>
                <span className="text-orange-600">{rpe} / 10</span>
              </div>
              <input type="range" min={1} max={10} value={rpe}
                onChange={(e) => setRpe(parseInt(e.target.value))} className="w-full accent-orange-500" />
              <div className={`mt-2 text-sm ${getRpeLevel(rpe).color} flex items-center gap-2`}>
                <span className="font-semibold">{getRpeLevel(rpe).label}</span>
                <span className="text-neutral-400">—</span>
                <span>{getRpeLevel(rpe).desc}</span>
              </div>
            </div>
            <Field label={`Calories (kcal) · 체중 ${profile.weight_kg}kg 기준`}>
              <input type="number" step="0.1" value={calories}
                onChange={(e) => setCalories(parseFloat(e.target.value) || 0)}
                className="w-full bg-transparent outline-none" />
            </Field>
            <button onClick={submit} disabled={saving}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-full py-3.5 shadow-[0_8px_24px_-8px_rgba(249,115,22,0.7)]">
              {saving ? "Saving..." : "Save run"}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-neutral-200 p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-xs uppercase tracking-widest text-orange-600">History</div>
              <h2 className="text-2xl tracking-tight mt-1">Recent runs</h2>
            </div>
            <span className="text-sm text-neutral-400">{runs.length} total · {totalMin}분</span>
          </div>
          {runs.length === 0 ? (
            <div className="text-center py-12 text-neutral-400">
              <p>아직 기록이 없습니다.</p>
              <p className="text-xs mt-1">첫 러닝을 기록해보세요 🏃</p>
            </div>
          ) : (
            <ul className="space-y-3 max-h-[520px] overflow-auto pr-1">
              {runs.map((r) => (
                <li key={r.id} className="group border border-neutral-200 hover:border-orange-300 rounded-2xl p-4 flex items-center justify-between transition">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center">
                      <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22 }}>{r.distance.toFixed(0)}</span>
                    </div>
                    <div>
                      <div className="text-sm text-neutral-500">{r.date} · {runTypeLabel(r.type)}</div>
                      <div className="tracking-tight">{r.distance.toFixed(1)} km · {r.time}분 · <span className="text-orange-600">{r.pace}</span></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-sm">
                      <div>RPE {r.rpe}</div>
                      <div className="text-neutral-400">{r.calories} kcal</div>
                    </div>
                    <button onClick={() => removeRun(r.id)}
                      className="opacity-0 group-hover:opacity-100 text-xs text-neutral-400 hover:text-red-500 transition">
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function TrendLine({
  data, unit = "", formatter, color = "#f97316", invert = false,
}: {
  data: { label: string; value: number; empty?: boolean }[];
  unit?: string; formatter?: (v: number) => string; color?: string; invert?: boolean;
}) {
  const W = 700, H = 180, PAD_X = 32, PAD_T = 20, PAD_B = 28;
  const values = data.filter((d) => !d.empty).map((d) => d.value);
  const max = values.length ? Math.max(...values) : 1;
  const min = values.length ? Math.min(...values) : 0;
  const range = max - min || 1;
  const step = data.length > 1 ? (W - PAD_X * 2) / (data.length - 1) : 0;
  const y = (v: number) => {
    const t = (v - min) / range;
    return PAD_T + (invert ? t : 1 - t) * (H - PAD_T - PAD_B);
  };
  const pts = data.map((d, i) => ({
    x: PAD_X + i * step, y: d.empty ? null : y(d.value), ...d,
  }));
  const path = pts.reduce((acc, p, i, arr) => {
    if (p.y == null) return acc;
    const prev = arr.slice(0, i).reverse().find((q) => q.y != null);
    if (!prev) return `M ${p.x} ${p.y}`;
    const cx = (prev.x + p.x) / 2;
    return `${acc} C ${cx} ${prev.y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
  }, "");
  const firstPt = pts.find((p) => p.y != null);
  const lastPt = [...pts].reverse().find((p) => p.y != null);
  const area = firstPt && lastPt && path
    ? `${path} L ${lastPt.x} ${H - PAD_B} L ${firstPt.x} ${H - PAD_B} Z`
    : "";
  const gridY = [0, 0.5, 1].map((t) => PAD_T + t * (H - PAD_T - PAD_B));
  const gid = `fill-${color.replace("#", "")}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44"
      preserveAspectRatio="xMidYMid meet"
      style={{ fontFamily: "Inter, sans-serif" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridY.map((gy, i) => (
        <line key={i} x1={PAD_X} x2={W - PAD_X} y1={gy} y2={gy}
          stroke="#e5e5e5" strokeDasharray="2 4" strokeWidth="1" />
      ))}
      {area && <path d={area} fill={`url(#${gid})`} />}
      {path && <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
      {pts.map((p, i) => (
        <g key={i}>
          {p.y != null && (
            <>
              <circle cx={p.x} cy={p.y} r="3.5" fill="white" stroke={color} strokeWidth="2" />
              {i === pts.length - 1 && (
                <text x={p.x} y={p.y - 10} textAnchor="end" fontSize="12" fontWeight="500" fill="#525252">
                  {formatter ? formatter(p.value) : `${p.value.toFixed(1)}${unit}`}
                </text>
              )}
            </>
          )}
          {(i === 0 || i === pts.length - 1 || i === Math.floor(pts.length / 2)) && (
            <text x={p.x} y={H - 8} textAnchor="middle" fontSize="12" fill="#a3a3a3">{p.label}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">{label}</span>
      <div className="border border-neutral-200 rounded-xl px-4 py-3 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 transition">
        {children}
      </div>
    </label>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-2xl p-4 bg-neutral-50 border border-neutral-100">
      <div className="text-[10px] uppercase tracking-widest text-neutral-400">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28, lineHeight: 1 }}>{value}</span>
        <span className="text-xs text-neutral-500">{unit}</span>
      </div>
    </div>
  );
}

function PrBadge({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const active = value !== "—";
  return (
    <div className={`rounded-2xl p-4 border ${active ? "bg-gradient-to-br from-orange-50 to-white border-orange-200" : "bg-neutral-50 border-neutral-100"}`}>
      <div className={`text-[10px] uppercase tracking-widest ${active ? "text-orange-600" : "text-neutral-400"}`}>{label}</div>
      <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 24, lineHeight: 1 }} className="mt-1">{value}</div>
      {sub && <div className="text-[11px] text-neutral-400 mt-1">{sub}</div>}
    </div>
  );
}
