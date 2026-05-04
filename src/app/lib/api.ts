import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { supabase } from "./supabase";

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-00832e50`;

async function request<T>(path: string, init?: RequestInit, auth = false): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${publicAnonKey}`,
    ...(init?.headers as Record<string, string> | undefined ?? {}),
  };
  if (auth) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      headers["X-User-Token"] = data.session.access_token;
    }
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const raw = await res.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { /* keep raw text below */ }
  if (!res.ok) {
    console.error(`API error ${path} [${res.status} ${res.statusText}]:`, raw || "(empty body)");
    throw new Error(data?.error ?? `Request failed: ${res.status} ${res.statusText}${raw && !data?.error ? ` — ${raw.slice(0, 200)}` : ""}`);
  }
  return data as T;
}

export type Run = {
  id: string;
  user_id: string;
  date: string;
  distance: number;
  time: number;
  pace: string;
  calories: number;
  type: string;
  rpe: number;
  created_at: string;
};

export type Competition = {
  id: string;
  name: string;
  date: string;
  location: string;
  link: string;
  status: "open" | "closed";
};

export type News = {
  id: string;
  thumbnail: string;
  title: string;
  published_at: string;
  source: string;
  link: string;
};

export type Profile = { weight_kg: number; weekly_goal_km: number };
export type Report = {
  id: string; user_id: string; rpe: number; is_continuous: boolean;
  sleep: number; notes?: string; text: string; model: string; created_at: string;
};

export const api = {
  signup: (payload: { email: string; password: string; name?: string }) =>
    request<{ user: { id: string; email: string } }>("/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listRuns: () => request<{ runs: Run[] }>("/runs", undefined, true),
  createRun: (run: Omit<Run, "id" | "user_id" | "created_at">) =>
    request<{ run: Run }>("/runs", { method: "POST", body: JSON.stringify(run) }, true),
  deleteRun: (id: string) =>
    request<{ ok: true }>(`/runs/${id}`, { method: "DELETE" }, true),
  getProfile: () => request<{ profile: Profile }>("/profile", undefined, true),
  saveProfile: (profile: Profile) =>
    request<{ profile: Profile }>("/profile", { method: "PUT", body: JSON.stringify(profile) }, true),
  listReports: () => request<{ reports: Report[] }>("/reports", undefined, true),
  deleteReport: (id: string) =>
    request<{ ok: true }>(`/reports/${id}`, { method: "DELETE" }, true),
  listCompetitions: () => request<{ competitions: Competition[] }>("/competitions"),
  listNews: () => request<{ news: News[] }>("/news"),
  aiCoach: (payload: { rpe: number; is_continuous: boolean; sleep: number; recent_runs?: Run[]; notes?: string }) =>
    request<{ text: string }>("/ai-coach", { method: "POST", body: JSON.stringify(payload) }, true),
  adminCreateCompetitions: (items: Partial<Competition>[]) =>
    request<{ created: Competition[] }>("/admin/competitions", { method: "POST", body: JSON.stringify({ items }) }, true),
  adminDeleteCompetition: (id: string) =>
    request<{ ok: true }>(`/admin/competitions/${id}`, { method: "DELETE" }, true),
  adminCreateNews: (items: Partial<News>[]) =>
    request<{ created: News[] }>("/admin/news", { method: "POST", body: JSON.stringify({ items }) }, true),
  adminDeleteNews: (id: string) =>
    request<{ ok: true }>(`/admin/news/${id}`, { method: "DELETE" }, true),
  adminAiDraft: (kind: "news" | "competitions", count = 6, queue = false) =>
    request<{ items: any[]; queued?: number }>("/admin/ai-draft", { method: "POST", body: JSON.stringify({ kind, count, queue }) }, true),
  adminGetFeeds: () =>
    request<{ news: string[]; competitions: string[]; defaults: { news: string[]; competitions: string[] } }>("/admin/rss-feeds", undefined, true),
  adminSaveFeeds: (payload: { news: string[]; competitions: string[] }) =>
    request<{ news: string[]; competitions: string[] }>("/admin/rss-feeds", { method: "PUT", body: JSON.stringify(payload) }, true),
  adminListPending: (kind: "news" | "competitions") =>
    request<{ pending: { id: string; kind: "news" | "competitions"; payload: any; source: string; created_at: string }[] }>(`/admin/pending?kind=${kind}`, undefined, true),
  adminApprovePending: (id: string) =>
    request<{ approved: any }>(`/admin/pending/${id}/approve`, { method: "POST" }, true),
  adminRejectPending: (id: string) =>
    request<{ ok: true }>(`/admin/pending/${id}`, { method: "DELETE" }, true),
  listBookmarks: () => request<{ bookmarks: string[] }>("/bookmarks", undefined, true),
  addBookmark: (id: string) => request<{ ok: true }>(`/bookmarks/${id}`, { method: "POST" }, true),
  removeBookmark: (id: string) => request<{ ok: true }>(`/bookmarks/${id}`, { method: "DELETE" }, true),
};
