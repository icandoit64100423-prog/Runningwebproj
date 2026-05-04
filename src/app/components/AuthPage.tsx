import { useState } from "react";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Sunburst } from "./Sunburst";

export function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) { toast.error("이메일과 비밀번호를 입력해주세요."); return; }
    setLoading(true);
    try {
      if (mode === "signup") {
        await api.signup({ email, password, name });
        toast.success("회원가입 완료! 자동 로그인됩니다.");
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("로그인 되었습니다.");
    } catch (e: any) {
      toast.error(e.message ?? "인증 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf7f2] text-neutral-900" style={{ fontFamily: "Inter, sans-serif" }}>
      <nav className="max-w-6xl mx-auto mt-6 px-4">
        <div className="bg-neutral-900 text-white rounded-full flex items-center justify-between px-6 py-3 shadow-lg">
          <span className="tracking-tight" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22 }}>runnerhub</span>
          <div className="flex items-center gap-2">
            <span className="text-sm opacity-70 hidden sm:inline">Start your journey</span>
            
          </div>
        </div>
      </nav>

      <section className="relative max-w-6xl mx-auto px-6 pt-16 pb-24">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Sunburst className="w-[680px] h-[680px] opacity-90" />
        </div>

        <div className="relative grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <span className="inline-block text-xs tracking-[0.2em] uppercase text-orange-600">AI Running Coach</span>
            <h1 className="tracking-tight leading-[1.05]" style={{ fontFamily: "'Instrument Serif', serif", fontSize: "clamp(44px, 6vw, 76px)" }}>
              A running log<br />like never before
            </h1>
            <p className="text-neutral-500 text-lg max-w-md">
              기록부터 컨디션 분석, 대회 정보와 세계 뉴스까지. AI 데이터 코치가 당신의 러닝을 설계합니다.
            </p>
            
          </div>

          <div className="relative bg-white/90 backdrop-blur rounded-3xl shadow-xl border border-neutral-200 p-8 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl tracking-tight">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
              <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="text-xs text-neutral-500 hover:text-orange-600">
                {mode === "signin" ? "Sign up →" : "Sign in →"}
              </button>
            </div>

            {mode === "signup" && (
              <Field label="이름">
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full bg-transparent outline-none" placeholder="홍길동" />
              </Field>
            )}

            <Field label="이메일">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent outline-none" placeholder="you@example.com" />
            </Field>

            <Field label="비밀번호">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent outline-none" placeholder="6자 이상" />
            </Field>

            <button onClick={submit} disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-full py-3.5 mt-2 shadow-[0_8px_24px_-8px_rgba(249,115,22,0.7)]">
              {loading ? "처리 중..." : mode === "signin" ? "로그인" : "회원가입 후 시작"}
            </button>
            <p className="text-xs text-neutral-400 text-center">가입 시 개인 러닝 로그가 생성되고 어디서나 동기화됩니다.</p>
          </div>
        </div>
      </section>
    </div>
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
