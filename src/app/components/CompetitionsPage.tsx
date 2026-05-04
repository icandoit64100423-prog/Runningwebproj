import { useEffect, useMemo, useState } from "react";
import { api, type Competition } from "../lib/api";
import { toast } from "sonner";

type Filter = "all" | "open" | "closed" | "saved";

function dday(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export function CompetitionsPage() {
  const [items, setItems] = useState<Competition[]>([]);
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listCompetitions(), api.listBookmarks().catch(() => ({ bookmarks: [] }))])
      .then(([c, b]) => {
        setItems(c.competitions);
        setBookmarks(new Set(b.bookmarks));
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleBookmark = async (id: string) => {
    const isOn = bookmarks.has(id);
    const next = new Set(bookmarks);
    if (isOn) next.delete(id); else next.add(id);
    setBookmarks(next);
    try {
      if (isOn) await api.removeBookmark(id);
      else await api.addBookmark(id);
    } catch (e: any) {
      toast.error(e.message);
      setBookmarks(bookmarks);
    }
  };

  const shown = useMemo(() => {
    let list = items;
    if (filter === "open") list = items.filter((c) => c.status === "open");
    else if (filter === "closed") list = items.filter((c) => c.status === "closed");
    else if (filter === "saved") list = items.filter((c) => bookmarks.has(c.id));
    return [...list].sort((a, b) => {
      const ab = bookmarks.has(a.id) ? 0 : 1;
      const bb = bookmarks.has(b.id) ? 0 : 1;
      if (ab !== bb) return ab - bb;
      return a.date.localeCompare(b.date);
    });
  }, [items, filter, bookmarks]);

  const tabCls = (f: Filter) =>
    `px-5 py-2 rounded-full text-sm transition ${filter === f ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-400"}`;

  const upcomingSaved = items.filter((c) => bookmarks.has(c.id) && c.status === "open").sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      {upcomingSaved.length > 0 && (
        <div className="bg-neutral-900 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute -top-16 -right-16 w-48 h-48 bg-orange-500/25 rounded-full blur-3xl" />
          <div className="relative flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-orange-300">Next target race</div>
              <h3 className="tracking-tight mt-1" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 30 }}>
                {upcomingSaved[0].name}
              </h3>
              <p className="text-sm text-neutral-400 mt-1">📍 {upcomingSaved[0].location} · {upcomingSaved[0].date}</p>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-orange-300">D-day</div>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 56, lineHeight: 1 }}>
                {dday(upcomingSaved[0].date)}
              </div>
              <div className="text-xs text-neutral-400">days left</div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilter("all")} className={tabCls("all")}>All</button>
          <button onClick={() => setFilter("open")} className={tabCls("open")}>모집 중</button>
          <button onClick={() => setFilter("closed")} className={tabCls("closed")}>마감</button>
          <button onClick={() => setFilter("saved")} className={tabCls("saved")}>⭐ 북마크</button>
        </div>
        <span className="text-sm text-neutral-400">{shown.length} races</span>
      </div>

      {loading ? (
        <p className="text-neutral-400">Loading...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((c) => {
            const d = dday(c.date);
            const saved = bookmarks.has(c.id);
            return (
              <div key={c.id} className="group bg-white rounded-3xl border border-neutral-200 hover:border-orange-300 p-6 shadow-sm hover:shadow-lg transition">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] uppercase tracking-widest px-3 py-1 rounded-full ${
                      c.status === "open" ? "bg-orange-100 text-orange-700" : "bg-neutral-100 text-neutral-500"
                    }`}>
                      {c.status === "open" ? "Open" : "Closed"}
                    </span>
                    {c.status === "open" && d >= 0 && (
                      <span className="text-[10px] uppercase tracking-widest px-3 py-1 rounded-full bg-neutral-900 text-white">
                        D-{d === 0 ? "DAY" : d}
                      </span>
                    )}
                  </div>
                  <button onClick={() => toggleBookmark(c.id)}
                    className={`text-xl transition ${saved ? "text-orange-500" : "text-neutral-300 hover:text-orange-400"}`}
                    aria-label="bookmark">
                    {saved ? "★" : "☆"}
                  </button>
                </div>
                <h3 className="tracking-tight mb-2" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28, lineHeight: 1.1 }}>
                  {c.name}
                </h3>
                <p className="text-sm text-neutral-500 mb-1">📅 {c.date}</p>
                <p className="text-sm text-neutral-500">📍 {c.location}</p>
              </div>
            );
          })}
          {shown.length === 0 && <p className="text-neutral-400">조건에 맞는 대회가 없습니다.</p>}
        </div>
      )}
    </div>
  );
}
