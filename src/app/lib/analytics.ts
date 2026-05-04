import type { Run } from "./api";

export function parsePaceToSec(pace: string): number | null {
  const m = /^(\d+)'(\d+)"?$/.exec(pace?.trim() ?? "");
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

export function paceSecToStr(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(2, "0")}'${String(s).padStart(2, "0")}"`;
}

export function weeklyKm(runs: Run[]): number {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return runs
    .filter((r) => new Date(r.date) >= start)
    .reduce((s, r) => s + (r.distance || 0), 0);
}

export function trainingLoadSeries(runs: Run[], days = 14) {
  const today = new Date();
  const out: { label: string; load: number; pace: number | null; date: string }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayRuns = runs.filter((r) => r.date === key);
    const load = dayRuns.reduce((s, r) => s + (r.rpe || 0) * (r.time || 0), 0);
    const totalKm = dayRuns.reduce((s, r) => s + (r.distance || 0), 0);
    const totalMin = dayRuns.reduce((s, r) => s + (r.time || 0), 0);
    const pace = totalKm > 0 ? (totalMin * 60) / totalKm : null;
    out.push({ label: key.slice(5), date: key, load, pace });
  }
  return out;
}

export type Prs = {
  longest: number;
  bestPaceSec: number | null;
  bestPaceRun?: Run;
  k5?: Run; k10?: Run; half?: Run; full?: Run;
};

const PR_DISTANCES: { key: "k5" | "k10" | "half" | "full"; min: number; label: string }[] = [
  { key: "k5", min: 5, label: "5K" },
  { key: "k10", min: 10, label: "10K" },
  { key: "half", min: 21.0975, label: "Half" },
  { key: "full", min: 42.195, label: "Full" },
];

export function computePRs(runs: Run[]): { prs: Prs; labels: typeof PR_DISTANCES } {
  const prs: Prs = { longest: 0, bestPaceSec: null };
  for (const r of runs) {
    if (r.distance > prs.longest) prs.longest = r.distance;
    const ps = parsePaceToSec(r.pace);
    if (ps != null && (prs.bestPaceSec == null || ps < prs.bestPaceSec)) {
      prs.bestPaceSec = ps; prs.bestPaceRun = r;
    }
    for (const d of PR_DISTANCES) {
      if (r.distance >= d.min) {
        const cur = prs[d.key];
        if (!cur || r.time / r.distance * d.min < cur.time / cur.distance * d.min) {
          prs[d.key] = r;
        }
      }
    }
  }
  return { prs, labels: PR_DISTANCES };
}
