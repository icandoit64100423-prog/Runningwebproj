import { useEffect, useState } from "react";
import { api, type Competition, type News } from "../lib/api";
import { toast } from "sonner";

type Kind = "news" | "competitions";

export function AdminPage() {
  const [kind, setKind] = useState<Kind>("news");
  const [showGuide, setShowGuide] = useState(true);
  return (
    <div className="space-y-6">
      {showGuide && <Guide onClose={() => setShowGuide(false)} />}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          <TabBtn active={kind === "news"} onClick={() => setKind("news")}>📰 News</TabBtn>
          <TabBtn active={kind === "competitions"} onClick={() => setKind("competitions")}>🏁 Competitions</TabBtn>
        </div>
        <div className="flex items-center gap-3">
          {!showGuide && (
            <button onClick={() => setShowGuide(true)} className="text-xs text-neutral-500 hover:text-neutral-900 underline underline-offset-2">
              사용법 보기
            </button>
          )}
          <span className="text-xs text-neutral-400">Admin only · {kind}</span>
        </div>
      </div>
      {kind === "news" && <RssFeedsPanel />}
      {kind === "news" ? <NewsAdmin /> : <CompetitionsAdmin />}
    </div>
  );
}

function Guide({ onClose }: { onClose: () => void }) {
  return (
    <div className="bg-neutral-900 text-white rounded-3xl p-7 shadow-xl relative overflow-hidden">
      <div className="absolute -top-20 -right-20 w-56 h-56 bg-orange-500/20 rounded-full blur-3xl" />
      <button onClick={onClose}
        className="absolute top-4 right-4 text-neutral-400 hover:text-white text-sm">✕ 닫기</button>
      <div className="relative space-y-5">
        <div>
          <div className="text-xs uppercase tracking-widest text-orange-300">Admin guide</div>
          <h2 className="tracking-tight mt-1" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 30 }}>
            관리자 사용법
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            뉴스는 RSS 자동 수집 → 검토 승인. 대회는 수동 입력만 지원합니다.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <GuideStep num="1" title="뉴스 RSS 소스 관리 📡"
            body="뉴스 탭 상단 'RSS 피드' 패널에서 피드 URL을 한 줄에 하나씩 등록합니다. 기본값은 publisher 직접 RSS(Runner's World, World Athletics, 동아·한겨레 스포츠 등)이며, [기본값으로 초기화]로 언제든 복원할 수 있습니다. 피드별 다양성은 round-robin으로 보장됩니다." />
          <GuideStep num="2" title="뉴스 자동 수집 → Pending 큐 🤖"
            body="개수를 선택하고 [🤖 자동 수집]을 누르면 RSS에서 후보를 가져와 러닝 키워드 필터·중복(Jaccard 0.55)·URL 검증을 통과한 항목이 Pending 큐에 적재됩니다. 썸네일은 RSS media 태그 → 기사 og:image 순으로 자동 추출. Pending에서 [승인]/[반려]로 처리하세요." />
          <GuideStep num="3" title="대회 수동 등록 🏁"
            body="대회 정보는 자동 수집을 비활성화했습니다. Competitions 탭의 왼쪽 폼에서 name·date·location·link를 직접 입력해 등록합니다. Open/Closed는 대회 날짜 기준으로 자동 결정됩니다." />
        </div>

        <div className="grid gap-3 md:grid-cols-2 text-sm">
          <Tip icon="💡" text="대회의 Open/Closed 상태는 승인 시점의 대회 날짜와 오늘 날짜를 비교해 자동 결정됩니다." />
          <Tip icon="🔍" text="뉴스는 publisher RSS만 사용하고, 한국 일반 스포츠 피드는 마라톤·러닝 키워드로 자동 거릅니다." />
          <Tip icon="🔁" text="이미 발행된 항목과 제목 유사도 ≥ 55%면 중복으로 간주해 큐에서 제외합니다." />
          <Tip icon="⚠️" text="자동 수집은 grounded(웹검색 OFF)지만 Pending 단계에서 링크·이미지 유효성을 한 번 더 확인하세요." />
        </div>
      </div>
    </div>
  );
}

function GuideStep({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center">{num}</span>
        <div className="tracking-tight">{title}</div>
      </div>
      <p className="text-xs text-neutral-400 leading-relaxed">{body}</p>
    </div>
  );
}

function Tip({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-start gap-2 text-neutral-300">
      <span>{icon}</span><span className="text-xs leading-relaxed">{text}</span>
    </div>
  );
}

function TabBtn({ active, onClick, children }: any) {
  return (
    <button onClick={onClick}
      className={`px-5 py-2 rounded-full text-sm transition ${active ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-400"}`}>
      {children}
    </button>
  );
}

/* ---------- NEWS ADMIN ---------- */
function NewsAdmin() {
  const [items, setItems] = useState<News[]>([]);
  const [draft, setDraft] = useState<Partial<News>>({ title: "", source: "", published_at: "", link: "", thumbnail: "" });
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiCount, setAiCount] = useState(6);
  const [pendingTick, setPendingTick] = useState(0);

  const load = () => api.listNews().then((r) => setItems(r.news)).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);

  const addOne = async () => {
    if (!draft.title || !draft.link) return toast.error("title과 link는 필수");
    setBusy(true);
    try { await api.adminCreateNews([draft]); toast.success("추가되었습니다."); setDraft({ title: "", source: "", published_at: "", link: "" }); load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const addBulk = async () => {
    try {
      const parsed = JSON.parse(bulk);
      if (!Array.isArray(parsed)) return toast.error("JSON 배열 형식이어야 합니다.");
      setBusy(true);
      const { created } = await api.adminCreateNews(parsed);
      toast.success(`${created.length}개 추가 완료`);
      setBulk(""); load();
    } catch (e: any) { toast.error(e.message ?? "파싱 실패"); }
    finally { setBusy(false); }
  };

  const aiDraft = async () => {
    setBusy(true);
    try {
      const { items, queued } = await api.adminAiDraft("news", aiCount, true);
      toast.success(`AI가 ${queued ?? items.length}건을 검토 대기열에 추가했습니다.`);
      setPendingTick((t) => t + 1);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    try { await api.adminDeleteNews(id); toast.success("삭제됨"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
    <PendingQueue kind="news" onApproved={load} refreshKey={pendingTick} />
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="min-w-0 bg-white rounded-3xl border border-neutral-200 p-8 shadow-sm space-y-5">
        <div>
          <div className="text-xs uppercase tracking-widest text-orange-600">New entry</div>
          <h3 className="text-2xl tracking-tight mt-1">뉴스 추가</h3>
        </div>
        <Field label="Title *"><input value={draft.title ?? ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="w-full min-w-0 bg-transparent outline-none" /></Field>
        <Field label="Source"><input value={draft.source ?? ""} onChange={(e) => setDraft({ ...draft, source: e.target.value })} className="w-full min-w-0 bg-transparent outline-none" placeholder="예: Runner's World" /></Field>
        <Field label="Published (YYYY-MM-DD)"><input value={draft.published_at ?? ""} onChange={(e) => setDraft({ ...draft, published_at: e.target.value })} className="w-full min-w-0 bg-transparent outline-none" placeholder="2026-04-23" /></Field>
        <Field label="Link *"><input value={draft.link ?? ""} onChange={(e) => setDraft({ ...draft, link: e.target.value })} className="w-full min-w-0 bg-transparent outline-none" placeholder="https://..." /></Field>
        <p className="text-xs text-neutral-400 -mt-3">* 썸네일은 기사 링크의 og:image에서 자동으로 추출됩니다.</p>
        <button onClick={addOne} disabled={busy}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-full py-3">추가</button>

        <div className="pt-5 border-t border-neutral-100">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm">Bulk / AI Draft</h4>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-neutral-500 border border-neutral-200 rounded-full px-2.5 py-1">
                <span>개수</span>
                <input type="number" min={1} max={20} value={aiCount}
                  onChange={(e) => setAiCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                  className="w-10 bg-transparent outline-none text-center" />
              </label>
              <button onClick={aiDraft} disabled={busy}
                className="text-xs bg-neutral-900 hover:bg-neutral-800 disabled:opacity-60 text-white rounded-full px-3 py-1.5">
                🤖 AI로 초안 받기
              </button>
            </div>
          </div>
          <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={8}
            className="w-full border border-neutral-200 rounded-xl p-3 text-xs font-mono"
            placeholder='[{"title":"...","link":"...","source":"...","published_at":"2026-04-22","thumbnail":"..."}]' />
          <button onClick={addBulk} disabled={busy || !bulk.trim()}
            className="mt-2 w-full bg-neutral-900 hover:bg-neutral-800 disabled:opacity-60 text-white rounded-full py-2.5 text-sm">
            JSON 가져오기
          </button>
        </div>
      </div>

      <div className="min-w-0 bg-white rounded-3xl border border-neutral-200 p-8 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl tracking-tight">저장된 뉴스 <span className="text-sm text-neutral-400">({items.length})</span></h3>
        </div>
        <ul className="space-y-2 max-h-[620px] overflow-auto pr-1">
          {items.map((n) => (
            <li key={n.id} className="border border-neutral-200 rounded-xl p-3 flex items-center gap-3">
              {n.thumbnail && /^https?:\/\//.test(n.thumbnail) && (
                <img src={n.thumbnail} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-neutral-400 truncate">{n.source} · {n.published_at}</div>
                <div className="truncate">{n.title}</div>
              </div>
              <button onClick={() => remove(n.id)} className="text-xs text-neutral-400 hover:text-red-500 ml-3 shrink-0">삭제</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
    </div>
  );
}

/* ---------- COMPETITIONS ADMIN ---------- */
function CompetitionsAdmin() {
  const [items, setItems] = useState<Competition[]>([]);
  const [draft, setDraft] = useState<Partial<Competition>>({ name: "", date: "", location: "", link: "", status: "open" });
  const [busy, setBusy] = useState(false);

  const load = () => api.listCompetitions().then((r) => setItems(r.competitions)).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);

  const addOne = async () => {
    if (!draft.name || !draft.date) return toast.error("name, date 필수");
    setBusy(true);
    try { await api.adminCreateCompetitions([draft]); toast.success("추가됨"); setDraft({ name: "", date: "", location: "", link: "", status: "open" }); load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    try { await api.adminDeleteCompetition(id); toast.success("삭제됨"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="min-w-0 bg-white rounded-3xl border border-neutral-200 p-8 shadow-sm space-y-5">
        <div>
          <div className="text-xs uppercase tracking-widest text-orange-600">New entry</div>
          <h3 className="text-2xl tracking-tight mt-1">대회 추가</h3>
          <p className="text-xs text-neutral-400 mt-1">대회 정보는 수동 입력만 지원합니다.</p>
        </div>
        <Field label="Name *"><input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full min-w-0 bg-transparent outline-none" /></Field>
        <Field label="Date (YYYY-MM-DD) *"><input value={draft.date ?? ""} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="w-full min-w-0 bg-transparent outline-none" placeholder="2026-05-18" /></Field>
        <Field label="Location"><input value={draft.location ?? ""} onChange={(e) => setDraft({ ...draft, location: e.target.value })} className="w-full min-w-0 bg-transparent outline-none" placeholder="예: 서울 광화문" /></Field>
        <Field label="Link"><input value={draft.link ?? ""} onChange={(e) => setDraft({ ...draft, link: e.target.value })} className="w-full min-w-0 bg-transparent outline-none" placeholder="https://..." /></Field>
        <p className="text-xs text-neutral-400 -mt-3">* Open/Closed는 대회 날짜와 오늘 날짜를 비교해 자동 결정됩니다.</p>
        <button onClick={addOne} disabled={busy}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-full py-3">추가</button>
      </div>

      <div className="min-w-0 bg-white rounded-3xl border border-neutral-200 p-8 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl tracking-tight">저장된 대회 <span className="text-sm text-neutral-400">({items.length})</span></h3>
        </div>
        <ul className="space-y-2 max-h-[620px] overflow-auto pr-1">
          {items.map((c) => (
            <li key={c.id} className="border border-neutral-200 rounded-xl p-3 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-neutral-400">{c.date} · {c.status}</div>
                <div className="truncate">{c.name} <span className="text-neutral-400 text-sm">· {c.location}</span></div>
              </div>
              <button onClick={() => remove(c.id)} className="text-xs text-neutral-400 hover:text-red-500 ml-3">삭제</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">{label}</span>
      <div className="border border-neutral-200 rounded-xl px-4 py-3 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 transition">
        {children}
      </div>
    </label>
  );
}

/* ---------- RSS FEEDS CONFIG ---------- */
function RssFeedsPanel() {
  const [open, setOpen] = useState(false);
  const [news, setNews] = useState<string[]>([]);
  const [comps, setComps] = useState<string[]>([]);
  const [defaults, setDefaults] = useState<{ news: string[]; competitions: string[] }>({ news: [], competitions: [] });
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.adminGetFeeds().then((r) => {
      setNews(r.news); setComps(r.competitions); setDefaults(r.defaults);
    }).catch((e) => toast.error(e.message));
  };
  useEffect(() => { if (open) load(); }, [open]);

  const save = async () => {
    setBusy(true);
    try {
      const cleaned = (arr: string[]) => arr.map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));
      await api.adminSaveFeeds({ news: cleaned(news), competitions: cleaned(comps) });
      toast.success("RSS 소스가 저장되었습니다.");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const resetDefaults = (k: "news" | "competitions") => {
    if (k === "news") setNews([...defaults.news]); else setComps([...defaults.competitions]);
  };

  return (
    <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left">
        <div>
          <div className="text-xs uppercase tracking-widest text-orange-600">RSS sources</div>
          <div className="tracking-tight text-lg mt-0.5">RSS 소스 설정</div>
        </div>
        <span className="text-neutral-400 text-sm">{open ? "▲ 닫기" : "▼ 열기"}</span>
      </button>
      {open && (
        <div className="px-6 pb-6 grid gap-5 md:grid-cols-2 border-t border-neutral-100 pt-5">
          {([
            { label: "📰 뉴스 피드", value: news, set: setNews, k: "news" as const },
          ]).map((g) => (
            <div key={g.k}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm">{g.label}</div>
                <button onClick={() => resetDefaults(g.k)} className="text-xs text-neutral-500 hover:text-neutral-900 underline underline-offset-2">기본값으로</button>
              </div>
              <textarea
                value={g.value.join("\n")}
                onChange={(e) => g.set(e.target.value.split(/\n+/))}
                rows={5}
                placeholder={"https://example.com/rss\nhttps://..."}
                className="w-full border border-neutral-200 rounded-xl p-3 text-xs font-mono"
              />
              <p className="text-[11px] text-neutral-400 mt-1">한 줄에 하나의 RSS URL. http(s)로 시작해야 합니다.</p>
            </div>
          ))}
          <div className="md:col-span-2">
            <button onClick={save} disabled={busy}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-full px-5 py-2.5 text-sm">
              저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- PENDING REVIEW QUEUE ---------- */
function PendingQueue({ kind, onApproved, refreshKey = 0 }: { kind: Kind; onApproved: () => void; refreshKey?: number }) {
  const [items, setItems] = useState<{ id: string; payload: any; source: string; created_at: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.adminListPending(kind).then((r) => setItems(r.pending)).catch((e) => toast.error(e.message));
  };
  useEffect(() => { load(); }, [kind, refreshKey]);

  const approve = async (id: string) => {
    setBusy(true);
    try { await api.adminApprovePending(id); toast.success("승인되어 게시되었습니다."); load(); onApproved(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const reject = async (id: string) => {
    if (!confirm("이 항목을 반려(삭제)하시겠습니까?")) return;
    setBusy(true);
    try { await api.adminRejectPending(id); toast.success("반려되었습니다."); load(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const approveAll = async () => {
    if (!items.length || !confirm(`${items.length}건을 모두 승인할까요?`)) return;
    setBusy(true);
    try {
      for (const it of items) await api.adminApprovePending(it.id);
      toast.success(`${items.length}건 승인 완료`); load(); onApproved();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const rejectAll = async () => {
    if (!items.length || !confirm(`${items.length}건을 모두 반려할까요?`)) return;
    setBusy(true);
    try {
      for (const it of items) await api.adminRejectPending(it.id);
      toast.success("모두 반려되었습니다."); load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-3xl border border-neutral-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-orange-600">Pending review</div>
          <h3 className="tracking-tight text-lg mt-0.5">검토 대기열 <span className="text-sm text-neutral-400">({items.length})</span></h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={busy} className="text-xs text-neutral-500 hover:text-neutral-900 underline underline-offset-2">새로고침</button>
          <button onClick={approveAll} disabled={busy || !items.length}
            className="text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-full px-3 py-1.5">전체 승인</button>
          <button onClick={rejectAll} disabled={busy || !items.length}
            className="text-xs bg-neutral-200 hover:bg-neutral-300 disabled:opacity-60 text-neutral-700 rounded-full px-3 py-1.5">전체 반려</button>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400 py-6 text-center">대기 중인 항목이 없습니다.</p>
      ) : (
        <ul className="space-y-2 max-h-[420px] overflow-auto pr-1">
          {items.map((it) => {
            const p = it.payload || {};
            const title = kind === "news" ? p.title : p.name;
            const meta = kind === "news"
              ? `${p.source || "-"} · ${p.published_at || "-"}`
              : `${p.date || "-"} · ${p.location || "-"}`;
            return (
              <li key={it.id} className="border border-neutral-200 rounded-xl p-3 flex items-center gap-3">
                {kind === "news" && p.thumbnail && /^https?:\/\//.test(p.thumbnail) && (
                  <img src={p.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-neutral-400 truncate">{meta} · <span className="text-orange-600">{it.source}</span></div>
                  <div className="truncate">{title || "(제목 없음)"}</div>
                  {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="text-[11px] text-neutral-400 hover:text-neutral-900 truncate block">{p.link}</a>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => approve(it.id)} disabled={busy}
                    className="text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-full px-3 py-1.5">승인</button>
                  <button onClick={() => reject(it.id)} disabled={busy}
                    className="text-xs text-neutral-500 hover:text-red-500 px-2">반려</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
