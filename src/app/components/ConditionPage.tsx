import { useEffect, useRef, useState } from "react";
import { api, type Report, type Run } from "../lib/api";
import { toast } from "sonner";

const getRpeLevel = (rpe: number) => {
  if (rpe >= 1 && rpe <= 4) return { label: "Low", desc: "회복 / 저강도", color: "text-blue-600" };
  if (rpe >= 5 && rpe <= 7) return { label: "Moderate", desc: "중간 강도", color: "text-yellow-600" };
  return { label: "High", desc: "고강도", color: "text-red-600" };
};

export function ConditionPage({ recentRuns }: { recentRuns: Run[] }) {
  const [rpe, setRpe] = useState(5);
  const [isContinuous, setIsContinuous] = useState(false);
  const [sleep, setSleep] = useState<number>(7);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [fullText, setFullText] = useState("");
  const [displayed, setDisplayed] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const loadReports = () => {
    api.listReports().then((r) => setReports(r.reports)).catch((e) => console.error(e));
  };
  useEffect(() => { loadReports(); }, []);

  useEffect(() => {
    if (!fullText) return;
    setDisplayed("");
    let i = 0;
    timerRef.current = window.setInterval(() => {
      i++;
      setDisplayed(fullText.slice(0, i));
      if (i >= fullText.length && timerRef.current) clearInterval(timerRef.current);
    }, 18);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fullText]);

  const analyze = async () => {
    setLoading(true);
    setFullText(""); setDisplayed(""); setSelectedId(null);
    try {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
      const recent = recentRuns.filter((r) => new Date(r.date) >= cutoff).slice(0, 10);
      const { text } = await api.aiCoach({ rpe, is_continuous: isContinuous, sleep, recent_runs: recent, notes });
      setFullText(text);
      loadReports();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const viewReport = (r: Report) => {
    setSelectedId(r.id);
    setFullText("");
    setDisplayed(r.text);
    setRpe(r.rpe); setIsContinuous(r.is_continuous); setSleep(r.sleep); setNotes(r.notes ?? "");
  };

  const deleteReport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("이 리포트를 삭제하시겠습니까?")) return;
    try {
      await api.deleteReport(id);
      if (selectedId === id) {
        setSelectedId(null);
        setFullText(""); setDisplayed("");
      }
      setReports((prev) => prev.filter((r) => r.id !== id));
      toast.success("리포트가 삭제되었습니다.");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-6">
        <div className="bg-white rounded-3xl border border-neutral-200 p-8 shadow-sm space-y-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-orange-600">Self check</div>
            <h2 className="text-2xl tracking-tight mt-1">오늘의 컨디션</h2>
          </div>
          <div>
            <div className="flex justify-between text-xs uppercase tracking-wider text-neutral-500 mb-2">
              <span>오늘의 운동 예상 RPE</span>
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
          <label className="flex items-center justify-between border border-neutral-200 rounded-2xl px-4 py-3 cursor-pointer hover:border-orange-300 transition">
            <div>
              <div className="text-sm">최근 3일 연속 운동</div>
              <div className="text-xs text-neutral-400">누적 피로도에 영향을 줍니다</div>
            </div>
            <input type="checkbox" checked={isContinuous}
              onChange={(e) => setIsContinuous(e.target.checked)} className="accent-orange-500 w-5 h-5" />
          </label>
          <div>
            <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">전날 수면 시간</div>
            <div className="border border-neutral-200 rounded-xl px-4 py-3 flex items-baseline gap-2">
              <input type="number" step="0.5" min={0} max={24} value={sleep}
                onChange={(e) => setSleep(parseFloat(e.target.value) || 0)}
                className="w-full bg-transparent outline-none" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28 }} />
              <span className="text-sm text-neutral-400">hours</span>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
              <span>특이사항 (선택)</span>
              <span className={notes.length >= 50 ? "text-orange-600" : "text-neutral-400"}>{notes.length}/50</span>
            </div>
            <div className="border border-neutral-200 rounded-xl px-4 py-3 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 transition">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 50))}
                rows={2} maxLength={50}
                placeholder="예: 오른쪽 무릎 약간 뻐근함, 생리 중, 컨디션 최상"
                className="w-full bg-transparent outline-none resize-none text-sm" />
            </div>
          </div>
          <button onClick={analyze} disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-full py-3.5 shadow-[0_8px_24px_-8px_rgba(249,115,22,0.7)]">
            {loading ? "분석 중..." : "AI 코치에게 분석 요청 🤖"}
          </button>
        </div>

        <div className="bg-white rounded-3xl border border-neutral-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-orange-600">Archive</div>
              <h3 className="tracking-tight mt-1">이전 리포트</h3>
            </div>
            <span className="text-xs text-neutral-400">{reports.length}개</span>
          </div>
          {reports.length === 0 ? (
            <p className="text-sm text-neutral-400 py-4 text-center">아직 분석 리포트가 없습니다.</p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-auto pr-1">
              {reports.map((r) => (
                <li key={r.id} className="group relative">
                  <button onClick={() => viewReport(r)}
                    className={`w-full text-left border rounded-xl px-3 py-2.5 pr-12 transition ${
                      selectedId === r.id ? "border-orange-400 bg-orange-50" : "border-neutral-200 hover:border-neutral-400"
                    }`}>
                    <div className="text-xs text-neutral-400">{new Date(r.created_at).toLocaleString()}</div>
                    <div className="text-sm truncate">RPE {r.rpe} · {r.sleep}h · {r.is_continuous ? "연속운동" : "휴식일"}</div>
                  </button>
                  <button onClick={(e) => deleteReport(r.id, e)}
                    aria-label="리포트 삭제"
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition">
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-neutral-900 text-white rounded-3xl p-8 shadow-xl min-h-[420px] relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-orange-500/20 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center">🤖</div>
            <div>
              <div className="text-xs uppercase tracking-widest text-orange-300">Gemini AI</div>
              <div className="tracking-tight">데이터 분석 리포트</div>
            </div>
          </div>
          {loading && (
            <div className="flex items-center gap-3 text-neutral-300">
              <div className="h-5 w-5 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" />
              <span>AI가 러너님의 데이터를 분석하고 있습니다...</span>
            </div>
          )}
          {!loading && displayed && (
            <pre className="whitespace-pre-wrap text-neutral-100 leading-relaxed" style={{ fontFamily: "Inter, sans-serif" }}>
              {displayed}{fullText && displayed.length < fullText.length && <span className="animate-pulse text-orange-400">▍</span>}
            </pre>
          )}
          {!loading && !displayed && (
            <div className="text-neutral-500 text-sm mt-8">
              <p>좌측에서 오늘의 컨디션을 입력하고</p>
              <p>분석 요청 버튼을 눌러주세요.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
