import { useCallback, useEffect, useState } from "react";
import { Toaster } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { RecordPage } from "./components/RecordPage";
import { ConditionPage } from "./components/ConditionPage";
import { CompetitionsPage } from "./components/CompetitionsPage";
import { NewsPage } from "./components/NewsPage";
import { AuthPage } from "./components/AuthPage";
import { AdminPage } from "./components/AdminPage";
import { Sunburst } from "./components/Sunburst";
import { ProfileDialog } from "./components/ProfileDialog";
import { api, type Run } from "./lib/api";
import { supabase } from "./lib/supabase";
import { useProfile } from "./lib/useProfile";

type Tab = "record" | "condition" | "competitions" | "news" | "admin";
const ADMIN_UID = "2647a689-d9be-4b12-bf99-b0ec372478ff";

const TABS: { key: Tab; label: string; hero: { eyebrow: string; title: string; subtitle: string }; adminOnly?: boolean }[] = [
  { key: "record", label: "Log", hero: { eyebrow: "RUNNING LOG", title: "Every stride, measured.", subtitle: "오늘의 거리, 시간, 페이스를 기록하고 체계적으로 관리하세요." } },
  { key: "condition", label: "Condition", hero: { eyebrow: "AI DATA COACH", title: "A health check\nlike never before.", subtitle: "AI가 수면·RPE·운동 지속일을 분석해 오늘의 컨디션을 진단합니다." } },
  { key: "competitions", label: "Races", hero: { eyebrow: "DOMESTIC RACES", title: "Find your next finish line.", subtitle: "국내 러닝 대회 일정과 모집 현황을 한눈에 확인하세요." } },
  { key: "news", label: "News", hero: { eyebrow: "GLOBAL NEWS", title: "The pulse of world running.", subtitle: "세계 러닝 신의 최신 소식을 매일 업데이트합니다." } },
  { key: "admin", label: "Admin", adminOnly: true, hero: { eyebrow: "ADMIN CONSOLE", title: "Content control room.", subtitle: "뉴스와 대회 정보를 추가·삭제하고 AI로 초안을 생성합니다." } },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("record");
  const [runs, setRuns] = useState<Run[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const { profile, save: saveProfile } = useProfile(!!session);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBootLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadRuns = useCallback(() => {
    if (!session) return;
    api.listRuns().then((r) => setRuns(r.runs)).catch((e) => console.error(e));
  }, [session]);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  if (bootLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#faf7f2] text-neutral-400">Loading...</div>;
  }
  if (!session) {
    return (<><Toaster richColors position="top-center" /><AuthPage /></>);
  }

  const userName = session.user.user_metadata?.name || session.user.email?.split("@")[0];
  const isAdmin = session.user.id === ADMIN_UID;
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);
  const current = visibleTabs.find((t) => t.key === tab) ?? visibleTabs[0];

  return (
    <div className="min-h-screen bg-[#faf7f2] text-neutral-900" style={{ fontFamily: "Inter, sans-serif" }}>
      <Toaster richColors position="top-center" />

      {/* Top pill nav */}
      <nav className="max-w-6xl mx-auto mt-6 px-4 sticky top-4 z-30">
        <div className="bg-neutral-900 text-white rounded-full flex items-center justify-between px-4 sm:px-6 py-2.5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-6">
            <span className="tracking-tight pl-2" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22 }}>runnerhub</span>
            <div className="hidden md:flex items-center gap-5 text-sm text-neutral-300">
              {visibleTabs.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`transition ${tab === t.key ? "text-white" : "hover:text-white"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowProfile(true)}
              className="hidden sm:flex items-center gap-2 text-sm text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-full px-3 py-1.5 transition">
              <span>👤 {userName}</span>
              <span className="text-xs text-neutral-500">· {profile.weight_kg}kg</span>
            </button>
            <button onClick={() => supabase.auth.signOut()}
              className="bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-full px-4 py-1.5">
              Logout
            </button>
          </div>
        </div>
        {/* mobile tabs */}
        <div className="md:hidden mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap ${tab === t.key ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200 text-neutral-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative max-w-6xl mx-auto px-6 pt-14 pb-10">
        <div className="pointer-events-none absolute inset-0 flex items-start justify-center -z-0">
          <Sunburst className="w-[720px] h-[720px] opacity-80 mt-[-40px]" />
        </div>
        <div className="relative text-center max-w-3xl mx-auto space-y-5">
          <span className="inline-block text-[11px] tracking-[0.25em] uppercase text-orange-600">{current.hero.eyebrow}</span>
          <h1 className="tracking-tight leading-[1.05] whitespace-pre-line"
            style={{ fontFamily: "'Instrument Serif', serif", fontSize: "clamp(40px, 6vw, 72px)" }}>
            {current.hero.title}
          </h1>
          <p className="text-neutral-500 text-lg">{current.hero.subtitle}</p>
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-6 pb-20 relative z-10">
        {tab === "record" && <RecordPage runs={runs} onCreated={loadRuns} profile={profile} />}
        {tab === "condition" && <ConditionPage recentRuns={runs} />}
        {tab === "competitions" && <CompetitionsPage />}
        {tab === "news" && <NewsPage />}
        {tab === "admin" && isAdmin && <AdminPage />}
      </main>

      {showProfile && (
        <ProfileDialog profile={profile} onSave={saveProfile} onClose={() => setShowProfile(false)} />
      )}
    </div>
  );
}
