import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const ADMIN_UID = "2647a689-d9be-4b12-bf99-b0ec372478ff";

async function requireAdmin(req: Request): Promise<boolean> {
  const uid = await getUserId(req);
  return uid === ADMIN_UID;
}

async function getUserId(req: Request): Promise<string | null> {
  const token =
    req.headers.get("X-User-Token") ||
    req.headers.get("x-user-token") ||
    null;
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    console.log("getUser failed:", error?.message);
    return null;
  }
  return data.user.id;
}

const app = new Hono();
app.use("*", logger(console.log));
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-User-Token"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

const BASE = "/make-server-00832e50";

const RUN_TYPE_KEYS = ["jogging", "running", "interval", "long", "tempo", "recovery", "treadmill", "race"] as const;
type RunTypeKey = typeof RUN_TYPE_KEYS[number];
const RUN_TYPE_LABELS: Record<RunTypeKey, string> = {
  jogging: "조깅", running: "러닝", interval: "인터벌", long: "롱런",
  tempo: "템포런", recovery: "회복런", treadmill: "트레드밀", race: "레이스",
};
const LEGACY_RUN_TYPE: Record<string, RunTypeKey> = {
  "조깅": "jogging", "런닝": "running", "러닝": "running", "인터벌": "interval",
  "롱런": "long", "템포런": "tempo", "회복런": "recovery", "트레드밀": "treadmill", "레이스": "race",
};
function normalizeRunType(value: unknown): RunTypeKey {
  const v = String(value ?? "").trim();
  if ((RUN_TYPE_KEYS as readonly string[]).includes(v)) return v as RunTypeKey;
  return LEGACY_RUN_TYPE[v] ?? "running";
}
function runTypeLabel(value: unknown): string {
  return RUN_TYPE_LABELS[normalizeRunType(value)];
}

/*
 * ===== DB SCHEMA (KV-backed) =====
 * runs         key: run:<id>          value: { id, user_id, date, distance, time, pace, calories, type, rpe, created_at }
 * competitions key: competition:<id>  value: { id, name, date, location, link, status }  // status: 'open' | 'closed'
 * news         key: news:<id>         value: { id, thumbnail, title, published_at, source, link }
 */

app.get(`${BASE}/health`, (c) => c.json({ status: "ok" }));

/* ---------- AUTH ---------- */
app.post(`${BASE}/signup`, async (c) => {
  try {
    const { email, password, name } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: "email과 password는 필수입니다." }, 400);
    }
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: { name: name ?? "" },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true,
    });
    if (error) {
      console.log("Signup error in POST /signup:", error);
      return c.json({ error: `회원가입 실패: ${error.message}` }, 400);
    }
    return c.json({ user: { id: data.user?.id, email: data.user?.email } });
  } catch (err) {
    console.log("Unexpected error in POST /signup:", err);
    return c.json({ error: `Signup failed: ${err}` }, 500);
  }
});

/* ---------- RUNS (auth required) ---------- */
app.get(`${BASE}/runs`, async (c) => {
  try {
    const userId = await getUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const rows = await kv.getByPrefix(`run:${userId}:`);
    rows.sort((a: any, b: any) => (b.date || "").localeCompare(a.date || ""));
    return c.json({ runs: rows });
  } catch (err) {
    console.log("Error loading runs in GET /runs:", err);
    return c.json({ error: `Failed to load runs: ${err}` }, 500);
  }
});

app.delete(`${BASE}/runs/:id`, async (c) => {
  try {
    const userId = await getUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    await kv.del(`run:${userId}:${id}`);
    return c.json({ ok: true });
  } catch (err) {
    console.log("Error deleting run in DELETE /runs/:id:", err);
    return c.json({ error: `Failed to delete run: ${err}` }, 500);
  }
});

/* ---------- PROFILE ---------- */
app.get(`${BASE}/profile`, async (c) => {
  try {
    const userId = await getUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const profile = (await kv.get(`profile:${userId}`)) ?? { weight_kg: 65 };
    return c.json({ profile });
  } catch (err) {
    console.log("Error loading profile in GET /profile:", err);
    return c.json({ error: `Failed to load profile: ${err}` }, 500);
  }
});

app.put(`${BASE}/profile`, async (c) => {
  try {
    const userId = await getUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    const profile = {
      weight_kg: Number(body.weight_kg) || 65,
      weekly_goal_km: Number(body.weekly_goal_km) || 20,
    };
    await kv.set(`profile:${userId}`, profile);
    return c.json({ profile });
  } catch (err) {
    console.log("Error saving profile in PUT /profile:", err);
    return c.json({ error: `Failed to save profile: ${err}` }, 500);
  }
});

/* ---------- BOOKMARKS ---------- */
app.get(`${BASE}/bookmarks`, async (c) => {
  try {
    const userId = await getUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const rows = await kv.getByPrefix(`bookmark:${userId}:`);
    return c.json({ bookmarks: rows.map((r: any) => r.competition_id) });
  } catch (err) {
    console.log("Error loading bookmarks in GET /bookmarks:", err);
    return c.json({ error: `Failed: ${err}` }, 500);
  }
});

app.post(`${BASE}/bookmarks/:id`, async (c) => {
  try {
    const userId = await getUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    await kv.set(`bookmark:${userId}:${id}`, { competition_id: id, created_at: new Date().toISOString() });
    return c.json({ ok: true });
  } catch (err) {
    console.log("Error adding bookmark in POST /bookmarks/:id:", err);
    return c.json({ error: `Failed: ${err}` }, 500);
  }
});

app.delete(`${BASE}/bookmarks/:id`, async (c) => {
  try {
    const userId = await getUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    await kv.del(`bookmark:${userId}:${id}`);
    return c.json({ ok: true });
  } catch (err) {
    console.log("Error removing bookmark in DELETE /bookmarks/:id:", err);
    return c.json({ error: `Failed: ${err}` }, 500);
  }
});

/* ---------- CONDITION REPORTS ---------- */
app.get(`${BASE}/reports`, async (c) => {
  try {
    const userId = await getUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const rows = await kv.getByPrefix(`report:${userId}:`);
    rows.sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""));
    return c.json({ reports: rows });
  } catch (err) {
    console.log("Error loading reports in GET /reports:", err);
    return c.json({ error: `Failed to load reports: ${err}` }, 500);
  }
});

app.delete(`${BASE}/reports/:id`, async (c) => {
  try {
    const userId = await getUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    const key = `report:${userId}:${id}`;
    const existing = await kv.get(key);
    if (!existing) return c.json({ error: "Report not found" }, 404);
    await kv.del(key);
    return c.json({ ok: true });
  } catch (err) {
    console.log("Error deleting report in DELETE /reports/:id:", err);
    return c.json({ error: `Failed to delete report: ${err}` }, 500);
  }
});

app.post(`${BASE}/runs`, async (c) => {
  try {
    const userId = await getUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    const id = crypto.randomUUID();
    const run = {
      id,
      user_id: userId,
      date: body.date,
      distance: Number(body.distance),
      time: Number(body.time),
      pace: body.pace,
      calories: Number(body.calories),
      type: normalizeRunType(body.type),
      rpe: Number(body.rpe),
      created_at: new Date().toISOString(),
    };
    await kv.set(`run:${userId}:${id}`, run);
    return c.json({ run });
  } catch (err) {
    console.log("Error creating run in POST /runs:", err);
    return c.json({ error: `Failed to create run: ${err}` }, 500);
  }
});

/* ---------- COMPETITIONS ---------- */
app.get(`${BASE}/competitions`, async (c) => {
  try {
    let rows = await kv.getByPrefix("competition:");
    const seededComp = await kv.get("seeded:competitions");
    if (rows.length === 0 && !seededComp) {
      const seeds = [
        { name: "서울 마라톤 2026", date: "2026-05-18", location: "서울 광화문", link: "https://seoul-marathon.example.com", status: "open" },
        { name: "부산 바다 하프", date: "2026-06-08", location: "부산 해운대", link: "https://busan-half.example.com", status: "open" },
        { name: "춘천 마라톤", date: "2026-10-25", location: "강원 춘천", link: "https://chuncheon.example.com", status: "open" },
        { name: "JTBC 서울 마라톤 2025", date: "2025-11-02", location: "서울 상암", link: "https://jtbc-marathon.example.com", status: "closed" },
        { name: "손기정 평화 마라톤", date: "2025-09-28", location: "서울 손기정 체육공원", link: "https://sonkijung.example.com", status: "closed" },
      ];
      for (const s of seeds) {
        const id = crypto.randomUUID();
        await kv.set(`competition:${id}`, { id, ...s });
      }
      await kv.set("seeded:competitions", true);
      rows = await kv.getByPrefix("competition:");
    }
    const today = new Date().toISOString().slice(0, 10);
    rows = rows.map((r: any) => ({ ...r, status: (r.date || "") < today ? "closed" : "open" }));
    rows.sort((a: any, b: any) => (a.date || "").localeCompare(b.date || ""));
    return c.json({ competitions: rows });
  } catch (err) {
    console.log("Error loading competitions in GET /competitions:", err);
    return c.json({ error: `Failed to load competitions: ${err}` }, 500);
  }
});

/* ---------- NEWS ---------- */
app.get(`${BASE}/news`, async (c) => {
  try {
    let rows = await kv.getByPrefix("news:");
    const seededNews = await kv.get("seeded:news");
    if (rows.length === 0 && !seededNews) {
      const seeds = [
        { thumbnail: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800", title: "Kipchoge eyes new world record attempt", published_at: "2026-04-20", source: "Runner's World", link: "https://example.com/news/1" },
        { thumbnail: "https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=800", title: "Tokyo Marathon 2026 registration opens", published_at: "2026-04-18", source: "Marathon News", link: "https://example.com/news/2" },
        { thumbnail: "https://images.unsplash.com/photo-1486218119243-13883505764c?w=800", title: "New carbon-plate rules announced", published_at: "2026-04-15", source: "World Athletics", link: "https://example.com/news/3" },
        { thumbnail: "https://images.unsplash.com/photo-1594737625785-a6cbdabd333c?w=800", title: "Berlin course record broken again", published_at: "2026-04-10", source: "Running Magazine", link: "https://example.com/news/4" },
        { thumbnail: "https://images.unsplash.com/photo-1502904550040-7534597429ae?w=800", title: "Top 10 trail races for 2026 summer", published_at: "2026-04-05", source: "Trail Runner", link: "https://example.com/news/5" },
        { thumbnail: "https://images.unsplash.com/photo-1461897104016-0b3b00cc81ee?w=800", title: "Training tips from elite coaches", published_at: "2026-03-30", source: "Runner's Digest", link: "https://example.com/news/6" },
      ];
      for (const s of seeds) {
        const id = crypto.randomUUID();
        await kv.set(`news:${id}`, { id, ...s });
      }
      await kv.set("seeded:news", true);
      rows = await kv.getByPrefix("news:");
    }
    rows.sort((a: any, b: any) => (b.published_at || "").localeCompare(a.published_at || ""));
    return c.json({ news: rows });
  } catch (err) {
    console.log("Error loading news in GET /news:", err);
    return c.json({ error: `Failed to load news: ${err}` }, 500);
  }
});

/* ---------- ADMIN: COMPETITIONS ---------- */
app.post(`${BASE}/admin/competitions`, async (c) => {
  if (!(await requireAdmin(c.req.raw))) return c.json({ error: "Forbidden" }, 403);
  try {
    const body = await c.req.json();
    const list = Array.isArray(body.items) ? body.items : [body];
    const created: any[] = [];
    for (const s of list) {
      const id = crypto.randomUUID();
      const row = {
        id,
        name: String(s.name ?? "").trim(),
        date: String(s.date ?? "").trim(),
        location: String(s.location ?? "").trim(),
        link: String(s.link ?? "").trim(),
        status: s.status === "closed" ? "closed" : "open",
      };
      if (!row.name || !row.date) continue;
      await kv.set(`competition:${id}`, row);
      created.push(row);
    }
    return c.json({ created });
  } catch (err) {
    console.log("Admin create competitions failed:", err);
    return c.json({ error: `Failed: ${err}` }, 500);
  }
});

app.delete(`${BASE}/admin/competitions/:id`, async (c) => {
  if (!(await requireAdmin(c.req.raw))) return c.json({ error: "Forbidden" }, 403);
  try {
    await kv.del(`competition:${c.req.param("id")}`);
    return c.json({ ok: true });
  } catch (err) {
    console.log("Admin delete competition failed:", err);
    return c.json({ error: `Failed: ${err}` }, 500);
  }
});

/* ---------- ADMIN: NEWS ---------- */
app.post(`${BASE}/admin/news`, async (c) => {
  if (!(await requireAdmin(c.req.raw))) return c.json({ error: "Forbidden" }, 403);
  try {
    const body = await c.req.json();
    const list = Array.isArray(body.items) ? body.items : [body];
    const created: any[] = [];
    for (const s of list) {
      const id = crypto.randomUUID();
      const row = {
        id,
        thumbnail: String(s.thumbnail ?? "").trim(),
        title: String(s.title ?? "").trim(),
        published_at: String(s.published_at ?? "").trim(),
        source: String(s.source ?? "").trim(),
        link: String(s.link ?? "").trim(),
      };
      if (!row.title || !row.link) continue;
      await kv.set(`news:${id}`, row);
      created.push(row);
    }
    return c.json({ created });
  } catch (err) {
    console.log("Admin create news failed:", err);
    return c.json({ error: `Failed: ${err}` }, 500);
  }
});

app.delete(`${BASE}/admin/news/:id`, async (c) => {
  if (!(await requireAdmin(c.req.raw))) return c.json({ error: "Forbidden" }, 403);
  try {
    await kv.del(`news:${c.req.param("id")}`);
    return c.json({ ok: true });
  } catch (err) {
    console.log("Admin delete news failed:", err);
    return c.json({ error: `Failed: ${err}` }, 500);
  }
});

function normalizeKey(s: string): string {
  return String(s ?? "").toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function absolutize(img: string, baseUrl: string): string {
  if (!img) return "";
  if (img.startsWith("//")) return "https:" + img;
  if (img.startsWith("/")) {
    try { const u = new URL(baseUrl); return `${u.protocol}//${u.host}${img}`; } catch { return img; }
  }
  return img;
}

async function fetchOgImage(url: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko,en;q=0.9",
      },
    });
    clearTimeout(timer);
    if (!resp.ok || !resp.body) return "";
    const finalUrl = resp.url || url;
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    const MAX = 256 * 1024; // 256KB — some sites push og tags below the fold
    while (html.length < MAX) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (html.includes("</head>")) break;
    }
    try { await reader.cancel(); } catch {}
    const patterns = [
      /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
      /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m?.[1]) return absolutize(decodeEntities(m[1]), finalUrl);
    }
    return "";
  } catch (err) {
    console.log("fetchOgImage failed for", url, err);
    return "";
  }
}

function faviconFor(url: string): string {
  const host = hostnameOf(url);
  return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=128` : "";
}

/* ---------- RSS-based 2-step extraction helpers ---------- */
// Publisher-direct RSS feeds (include real article URLs and <media:content> images).
// We deliberately avoid Google News aggregator: it obfuscates source URLs and
// strips images by design, making thumbnail extraction unreliable.
const NEWS_FEEDS = [
  // English authoritative running coverage (native images via media tags)
  "https://www.runnersworld.com/rss/all.xml/",
  "https://worldathletics.org/api-feeds/news/rss",
  // Korean general sports — filtered down to running/marathon by keyword regex below
  "https://rss.donga.com/sports.xml",
  "https://www.hani.co.kr/rss/sports/",
];
// Running/marathon relevance filter — strict compound terms only.
// Single words like "running"/"runner"/"트랙"/"페이스" match too many other sports.
const RUNNING_KEYWORDS = new RegExp(
  [
    "마라톤", "하프\\s?마라톤", "풀\\s?마라톤", "울트라\\s?마라톤",
    "러닝", "러너", "조깅", "달리기", "육상\\s?(?:대회|선수|경기|연맹)",
    "풀코스", "하프코스", "10\\s?km?\\s?(?:대회|레이스|기록)?", "5\\s?km?\\s?(?:대회|레이스)",
    "트레일\\s?러닝", "페이스\\s?메이커", "러닝\\s?화", "러닝\\s?크루",
    "marathon", "half[-\\s]?marathon", "ultra[-\\s]?marathon",
    "trail\\s?running", "track\\s?(?:and|&)\\s?field",
    "long[-\\s]?distance\\s?run", "road\\s?race", "5k\\s?race", "10k\\s?race",
    "boston\\s?marathon", "berlin\\s?marathon", "tokyo\\s?marathon",
    "world\\s?athletics", "runners?\\s?world",
  ].join("|"),
  "i",
);
const COMP_FEEDS = [
  "https://news.google.com/rss/search?q=%EB%A7%88%EB%9D%BC%ED%86%A4+%EB%8C%80%ED%9A%8C+%EC%8B%A0%EC%B2%AD&hl=ko&gl=KR&ceid=KR:ko",
  "https://news.google.com/rss/search?q=%EB%A7%88%EB%9D%BC%ED%86%A4+%EC%A0%91%EC%88%98+OR+%EA%B0%9C%EC%B5%9C&hl=ko&gl=KR&ceid=KR:ko",
];

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
function stripTags(s: string): string { return s.replace(/<[^>]*>/g, "").trim(); }

type RssItem = { title: string; link: string; pubDate: string; description: string; source?: string; sourceUrl?: string; image?: string };
function extractRssImage(block: string, rawDesc: string): string {
  // <media:content url="..." medium="image"> / <media:thumbnail url="...">
  const media =
    block.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+\.(?:jpg|jpeg|png|webp|gif)[^"']*)["']/i) ||
    block.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["'][^>]*medium=["']image["']/i);
  if (media?.[1]) return media[1];
  // <enclosure url="..." type="image/...">
  const enc = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image\/[^"']*["']/i);
  if (enc?.[1]) return enc[1];
  // <itunes:image href="...">
  const itunes = block.match(/<itunes:image[^>]+href=["']([^"']+)["']/i);
  if (itunes?.[1]) return itunes[1];
  // <img src="..."> inside description/content
  const img = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (img?.[1]) return img[1];
  return "";
}
function parseRss(xml: string): RssItem[] {
  const out: RssItem[] = [];
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/item>/i)[0];
    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return m ? decodeEntities(m[1]).trim() : "";
    };
    const rawDesc = get("description") || get("summary") || get("content:encoded");
    let link = stripTags(get("link")) || (block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ?? "");
    // Google News RSS wraps real article URL inside <description><a href="..."> when available.
    // If not, KEEP the news.google.com URL — it JS-redirects to the article when clicked.
    // NEVER fall back to <source url="..."> because that points to the publisher homepage, not the article.
    if (/^https?:\/\/news\.google\.com\//i.test(link)) {
      const m = rawDesc.match(/<a\s+[^>]*href=["']([^"']+)["']/i);
      if (m && m[1] && !/^https?:\/\/news\.google\.com\//i.test(m[1])) link = m[1];
    }
    const sourceUrl = block.match(/<source[^>]*url=["']([^"']+)["']/i)?.[1];
    const item: RssItem = {
      title: stripTags(get("title")),
      link,
      pubDate: stripTags(get("pubDate")) || stripTags(get("published")) || stripTags(get("updated")),
      description: stripTags(rawDesc).slice(0, 500),
      source: stripTags(get("source")) || (sourceUrl ? hostnameOf(sourceUrl) : undefined),
      sourceUrl,
      image: extractRssImage(block, rawDesc),
    };
    if (item.title && item.link) out.push(item);
  }
  return out;
}

async function fetchFeed(url: string): Promise<{ url: string; items: RssItem[]; status: number; error?: string }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
        "Accept-Language": "ko,en;q=0.9",
      },
    });
    clearTimeout(timer);
    if (!resp.ok) {
      console.log(`RSS feed ${url} -> ${resp.status}`);
      return { url, items: [], status: resp.status, error: `HTTP ${resp.status}` };
    }
    const items = parseRss(await resp.text());
    console.log(`RSS feed ${url} -> ${items.length} items`);
    return { url, items, status: 200 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`RSS fetch failed ${url}:`, msg);
    return { url, items: [], status: 0, error: msg };
  }
}

async function verifyUrl(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch(url, {
      method: "HEAD", redirect: "follow", signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RunnerHubBot/1.0)" },
    });
    clearTimeout(timer);
    if (resp.ok) return true;
    if (resp.status === 405 || resp.status === 403) return true; // some servers block HEAD
    return false;
  } catch { return false; }
}

function tokenize(s: string): Set<string> {
  return new Set(
    String(s ?? "").toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/).filter((t) => t.length >= 2),
  );
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function toIsoDate(s: string): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) {
    const m = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    return "";
  }
  return d.toISOString().slice(0, 10);
}
function hostnameOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// Decode the base64 (urlsafe) payload embedded in Google News RSS article URLs.
// Path like: /rss/articles/CBMi<base64>?... — the decoded protobuf bytes contain
// the real article URL as a printable substring.
function decodeGoogleNewsUrl(url: string): string {
  const m = url.match(/news\.google\.com\/(?:rss\/)?articles\/([^?\/]+)/i);
  if (!m) return "";
  let s = m[1].replace(/-/g, "+").replace(/_/g, "/");
  s += "=".repeat((4 - (s.length % 4)) % 4);
  try {
    const bin = atob(s);
    // Greedy match for HTTP(S) URL inside the protobuf bytes.
    const found = bin.match(/https?:\/\/[A-Za-z0-9\-._~:/?#@!$&'()*+,;=%]+/);
    if (!found) return "";
    let u = found[0];
    // Protobuf often appends control bytes after the URL — trim trailing junk.
    u = u.replace(/[^A-Za-z0-9\-._~:/?#@!$&'()*+,;=%]+$/, "");
    // Some encodings end with stray punctuation that's not part of the URL.
    u = u.replace(/[.,)\];]+$/, "");
    if (!/^https?:\/\/[^/]+\./.test(u)) return "";
    if (/news\.google\.com/i.test(u)) return "";
    return u;
  } catch {
    return "";
  }
}

// Google sets a consent wall for EU/Korean traffic; sending these cookies skips it
// so the response HTML actually contains the article URL fields.
const GOOGLE_CONSENT_COOKIE =
  "CONSENT=YES+cb; SOCS=CAESHAgBEhJnd3NfMjAyMjA3MTktMF9SQzIaAmVuIAEaBgiA0o-mBg";

function pickArticleUrlFromHtml(html: string): string {
  // 1) Direct attribute on the c-wiz/anchor wrapper
  const dataAttr = html.match(/data-n-au=["'](https?:\/\/[^"']+)["']/i);
  if (dataAttr?.[1] && !/news\.google\.com/i.test(dataAttr[1])) return dataAttr[1];
  // 2) <link rel="canonical">
  const linkRel = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (linkRel?.[1] && !/news\.google\.com/i.test(linkRel[1])) return linkRel[1];
  // 3) <meta http-equiv="refresh" url=...>
  const meta = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'>\s]+)/i);
  if (meta?.[1] && !/news\.google\.com/i.test(meta[1])) return meta[1];
  // 4) JSON-embedded URL inside scripts: "url":"https:\/\/site.com\/..."
  const jsonUrls = html.matchAll(/"(https?:\\?\/\\?\/[^"\\]+)"/g);
  for (const m of jsonUrls) {
    const u = m[1].replace(/\\\//g, "/");
    if (/^https?:\/\//.test(u) &&
        !/(?:google|gstatic|googleusercontent|googleapis|googleadservices|doubleclick|youtube)\.com/i.test(u) &&
        !/\.(?:js|css|svg|woff2?|ico|png|jpg|gif)(?:[?#]|$)/i.test(u)) {
      return u;
    }
  }
  return "";
}

async function resolveArticleUrl(url: string): Promise<string> {
  if (!/news\.google\.com/i.test(url)) return url;
  // Step 1: base64 decode of URL path — fastest, no network call.
  const decoded = decodeGoogleNewsUrl(url);
  if (decoded) return decoded;
  // Step 2: HTTP fetch with consent cookie + browser headers.
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const resp = await fetch(url, {
      signal: ctrl.signal, redirect: "follow",
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "Cookie": GOOGLE_CONSENT_COOKIE,
        "Referer": "https://news.google.com/",
      },
    });
    clearTimeout(timer);
    if (resp.url && !/news\.google\.com/i.test(resp.url)) return resp.url;
    if (!resp.ok) return url;
    const html = (await resp.text()).slice(0, 400_000);
    const found = pickArticleUrlFromHtml(html);
    if (found) return found;
    return url;
  } catch (err) {
    console.log("resolveArticleUrl failed for", url, err);
    return url;
  }
}

/* ---------- ADMIN: RSS feed config ---------- */
async function getFeeds(kind: "news" | "competitions"): Promise<string[]> {
  const stored = await kv.get(`config:rss_feeds:${kind}`);
  if (Array.isArray(stored) && stored.length > 0) return stored as string[];
  return kind === "competitions" ? COMP_FEEDS : NEWS_FEEDS;
}

app.get(`${BASE}/admin/rss-feeds`, async (c) => {
  if (!(await requireAdmin(c.req.raw))) return c.json({ error: "Forbidden" }, 403);
  try {
    const news = await getFeeds("news");
    const competitions = await getFeeds("competitions");
    return c.json({ news, competitions, defaults: { news: NEWS_FEEDS, competitions: COMP_FEEDS } });
  } catch (err) {
    console.log("Error in GET /admin/rss-feeds:", err);
    return c.json({ error: `Failed: ${err}` }, 500);
  }
});

app.put(`${BASE}/admin/rss-feeds`, async (c) => {
  if (!(await requireAdmin(c.req.raw))) return c.json({ error: "Forbidden" }, 403);
  try {
    const body = await c.req.json();
    const clean = (arr: unknown): string[] =>
      Array.isArray(arr)
        ? arr.map(String).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s))
        : [];
    const news = clean(body.news);
    const competitions = clean(body.competitions);
    await kv.set(`config:rss_feeds:news`, news);
    await kv.set(`config:rss_feeds:competitions`, competitions);
    return c.json({ news, competitions });
  } catch (err) {
    console.log("Error in PUT /admin/rss-feeds:", err);
    return c.json({ error: `Failed: ${err}` }, 500);
  }
});

/* ---------- ADMIN: pending review queue ---------- */
app.get(`${BASE}/admin/pending`, async (c) => {
  if (!(await requireAdmin(c.req.raw))) return c.json({ error: "Forbidden" }, 403);
  try {
    const kind = c.req.query("kind");
    const prefix = kind ? `pending:${kind}:` : `pending:`;
    const rows = await kv.getByPrefix(prefix);
    rows.sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""));
    return c.json({ pending: rows });
  } catch (err) {
    console.log("Error in GET /admin/pending:", err);
    return c.json({ error: `Failed: ${err}` }, 500);
  }
});

app.post(`${BASE}/admin/pending`, async (c) => {
  if (!(await requireAdmin(c.req.raw))) return c.json({ error: "Forbidden" }, 403);
  try {
    const { kind, items, source } = await c.req.json();
    if (kind !== "news" && kind !== "competitions") return c.json({ error: "invalid kind" }, 400);
    if (!Array.isArray(items)) return c.json({ error: "items must be an array" }, 400);
    const created: any[] = [];
    for (const payload of items) {
      const id = crypto.randomUUID();
      const row = { id, kind, payload, source: source || "manual", created_at: new Date().toISOString() };
      await kv.set(`pending:${kind}:${id}`, row);
      created.push(row);
    }
    return c.json({ created });
  } catch (err) {
    console.log("Error in POST /admin/pending:", err);
    return c.json({ error: `Failed: ${err}` }, 500);
  }
});

app.delete(`${BASE}/admin/pending/:id`, async (c) => {
  if (!(await requireAdmin(c.req.raw))) return c.json({ error: "Forbidden" }, 403);
  try {
    const id = c.req.param("id");
    const news = await kv.get(`pending:news:${id}`);
    const comp = !news ? await kv.get(`pending:competitions:${id}`) : null;
    const row: any = news || comp;
    if (!row) return c.json({ error: "not found" }, 404);
    await kv.del(`pending:${row.kind}:${id}`);
    return c.json({ ok: true });
  } catch (err) {
    console.log("Error in DELETE /admin/pending/:id:", err);
    return c.json({ error: `Failed: ${err}` }, 500);
  }
});

app.post(`${BASE}/admin/pending/:id/approve`, async (c) => {
  if (!(await requireAdmin(c.req.raw))) return c.json({ error: "Forbidden" }, 403);
  try {
    const id = c.req.param("id");
    const news = await kv.get(`pending:news:${id}`);
    const comp = !news ? await kv.get(`pending:competitions:${id}`) : null;
    const row: any = news || comp;
    if (!row) return c.json({ error: "not found" }, 404);
    const newId = crypto.randomUUID();
    if (row.kind === "news") {
      const p = row.payload || {};
      const item = {
        id: newId,
        title: String(p.title ?? ""),
        link: String(p.link ?? ""),
        source: String(p.source ?? ""),
        published_at: String(p.published_at ?? ""),
        thumbnail: String(p.thumbnail ?? ""),
        created_at: new Date().toISOString(),
      };
      await kv.set(`news:${newId}`, item);
      await kv.del(`pending:news:${id}`);
      return c.json({ approved: item });
    } else {
      const p = row.payload || {};
      const today = new Date().toISOString().slice(0, 10);
      const item = {
        id: newId,
        name: String(p.name ?? ""),
        date: String(p.date ?? ""),
        location: String(p.location ?? ""),
        link: String(p.link ?? ""),
        status: (p.date && p.date >= today) ? "open" : "closed",
        created_at: new Date().toISOString(),
      };
      await kv.set(`competition:${newId}`, item);
      await kv.del(`pending:competitions:${id}`);
      return c.json({ approved: item });
    }
  } catch (err) {
    console.log("Error in POST /admin/pending/:id/approve:", err);
    return c.json({ error: `Failed: ${err}` }, 500);
  }
});

async function savePending(kind: "news" | "competitions", items: any[], source: string) {
  const rows: any[] = [];
  for (const payload of items) {
    const id = crypto.randomUUID();
    const row = { id, kind, payload, source, created_at: new Date().toISOString() };
    await kv.set(`pending:${kind}:${id}`, row);
    rows.push(row);
  }
  return rows;
}

/* ---------- ADMIN: AI DRAFT (RSS + grounded extraction) ---------- */
app.post(`${BASE}/admin/ai-draft`, async (c) => {
  if (!(await requireAdmin(c.req.raw))) return c.json({ error: "Forbidden" }, 403);
  try {
    const { kind, count, queue } = await c.req.json();
    if (kind === "competitions") {
      return c.json({ error: "대회 자동 수집은 비활성화되었습니다. 수동으로 입력하세요." }, 400);
    }
    const n = Math.max(1, Math.min(20, Number(count) || 6));
    const feeds = await getFeeds("news");

    // Step 1: gather candidates from RSS in parallel
    const fetched = await Promise.all(feeds.map(fetchFeed));
    const fetchDiag = fetched.map((f) => ({
      url: f.url, status: f.status, items: f.items.length, error: f.error,
    }));
    const totalRaw = fetched.reduce((s, f) => s + f.items.length, 0);
    // Apply per-feed relevance filter BEFORE round-robin so each feed's quota
    // contains only running content. Otherwise a non-running-heavy feed would
    // contribute zero usable items but still consume its slot in the rotation.
    const perFeedFiltered: RssItem[][] = fetched.map(({ items: feedItems }) => {
      if (kind === "competitions") return feedItems;
      return feedItems.filter((it) => {
        const haystack = `${it.title} ${it.description} ${it.source ?? ""}`;
        return RUNNING_KEYWORDS.test(haystack);
      });
    });
    // Round-robin interleave across feeds so no single source dominates the
    // candidate list. Without this, fetched.flat() would put feed 0's entire
    // payload before feed 1's, and the downstream slice(0, n*3) would starve
    // later feeds.
    let candidates: RssItem[] = [];
    const cursors = perFeedFiltered.map(() => 0);
    let added = true;
    while (added) {
      added = false;
      for (let i = 0; i < perFeedFiltered.length; i++) {
        const list = perFeedFiltered[i];
        if (cursors[i] < list.length) {
          candidates.push(list[cursors[i]++]);
          added = true;
        }
      }
    }
    if (candidates.length === 0) {
      const diag = fetchDiag.map((d) =>
        `- ${d.url} → ${d.status === 0 ? `오류(${d.error})` : `HTTP ${d.status}`}, ${d.items}건`
      ).join("\n");
      const msg = totalRaw === 0
        ? `RSS 소스에서 항목을 가져오지 못했습니다.\n\n[피드 상태]\n${diag}`
        : `RSS에서 ${totalRaw}건을 받았으나 러닝 키워드 필터를 통과한 항목이 없습니다. RSS 소스를 러닝 전용 매체로 교체하거나 키워드를 확인하세요.\n\n[피드 상태]\n${diag}`;
      return c.json({ error: msg }, 502);
    }

    // Existing items for dedup
    const existing = kind === "competitions"
      ? await kv.getByPrefix("competition:")
      : await kv.getByPrefix("news:");
    const existingLinks = new Set(
      (existing as any[]).map((e) => normalizeKey(e.link || "")).filter(Boolean),
    );
    const existingTokens = (existing as any[])
      .map((e) => tokenize(kind === "competitions" ? e.name || "" : e.title || ""))
      .filter((t) => t.size > 0);

    // Internal + cross-existing dedup (Jaccard ≥ 0.55)
    const accepted: (RssItem & { _tok: Set<string> })[] = [];
    for (const it of candidates) {
      const linkKey = normalizeKey(it.link);
      if (linkKey && existingLinks.has(linkKey)) continue;
      const tok = tokenize(it.title);
      if (tok.size === 0) continue;
      const dup =
        existingTokens.some((et) => jaccard(tok, et) >= 0.55) ||
        accepted.some((a) => jaccard(tok, a._tok) >= 0.55);
      if (dup) continue;
      accepted.push({ ...it, _tok: tok });
      if (accepted.length >= n * 3) break;
    }

    // Step 2a: verify reachable URLs (cheap defense against dead links)
    const verifyResults = await Promise.all(accepted.map((it) => verifyUrl(it.link)));
    const verified = accepted.filter((_, i) => verifyResults[i]);

    if (verified.length === 0) {
      return c.json({ error: "유효한 후보 항목을 찾지 못했습니다." }, 404);
    }

    /* ---- NEWS: RSS gives us full structure already ---- */
    if (kind !== "competitions") {
      const top = verified.slice(0, n);
      const items = await Promise.all(top.map(async (it) => {
        // Resolve real article URL for image extraction. Keep original RSS link
        // for click navigation (Google News' JS redirect routes correctly).
        const resolved = await resolveArticleUrl(it.link);
        // Article-image-only policy:
        //  1. RSS-supplied media/enclosure/img (article-specific)
        //  2. og:image of resolved article page (article-specific)
        //  3. og:image of news.google.com page (Google often caches article hero image)
        // No publisher-homepage og:image and no favicon — those are logos, not articles.
        let thumbnail = it.image || "";
        if (!thumbnail && resolved && !/news\.google\.com/i.test(resolved)) {
          thumbnail = await fetchOgImage(resolved);
        }
        if (!thumbnail && /news\.google\.com/i.test(it.link)) {
          const ogi = await fetchOgImage(it.link);
          // Google News often returns its generic logo when the article image
          // isn't cached — filter those out so frontend shows a clean placeholder.
          if (ogi && !/(?:gstatic\.com\/.*\/news|google\.com\/images\/branding|googleusercontent\.com\/.*=s\d{1,3}-)/i.test(ogi)) {
            thumbnail = ogi;
          }
        }
        return {
          title: it.title,
          link: it.link,
          published_at: toIsoDate(it.pubDate) || new Date().toISOString().slice(0, 10),
          source: it.source || hostnameOf(resolved) || hostnameOf(it.sourceUrl || "") || hostnameOf(it.link),
          thumbnail,
        };
      }));
      if (queue) {
        const rows = await savePending("news", items, "rss");
        return c.json({ items, queued: rows.length, source: "rss" });
      }
      return c.json({ items, source: "rss" });
    }

    return c.json({ error: "invalid kind" }, 400);
  } catch (err) {
    console.log("Error in POST /admin/ai-draft:", err);
    return c.json({ error: `Failed to build AI draft: ${err}` }, 500);
  }
});

/* ---------- GEMINI AI COACH ---------- */
app.post(`${BASE}/ai-coach`, async (c) => {
  try {
    const { rpe, is_continuous, sleep, recent_runs, notes } = await c.req.json();
    const notesClean = String(notes ?? "").slice(0, 50).trim();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return c.json({ error: "GEMINI_API_KEY is not configured on the server" }, 500);
    }
    const runsSummary = Array.isArray(recent_runs) && recent_runs.length
      ? recent_runs.slice(0, 7).map((r: any) => `- ${r.date}: ${runTypeLabel(r.type)} ${r.distance}km ${r.time}분 페이스 ${r.pace} RPE ${r.rpe}`).join("\n")
      : "(최근 기록 없음)";
    const systemPrompt = `너는 사용자의 러닝 컨디션을 분석하는 'AI 데이터 분석 코치 🤖'야. 아래 데이터를 수치적으로 분석해서 오늘 적합한 운동 강도나 휴식을 권고해 줘.

[오늘의 컨디션]
- 오늘 운동 예상 RPE(사용자가 계획한 강도): ${rpe}/10
- 3일 연속 운동: ${is_continuous ? "예" : "아니오"}
- 전날 수면 시간: ${sleep}시간

[최근 7일 러닝 로그]
${runsSummary}
${notesClean ? `\n[사용자 특이사항]\n${notesClean}\n` : ""}
'안녕하세요! 데이터 기반 AI 코치입니다.'로 시작하고, 제공된 수치와 최근 훈련 추이(누적 거리, 강도 변화)를 직접 언급하며 기계적이고 분석적인 말투를 사용해. 사용자가 계획한 예상 RPE가 최근 누적 부하·수면·연속 운동 일수 대비 적절한지 평가하고, 그대로 진행/하향 조정/회복일로 전환 중 하나를 명확히 지시해 줘.`;

    const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];
    let lastErr = "";
    let lastStatus = 500;
    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "응답을 생성하지 못했습니다.";
        const userId = await getUserId(c.req.raw);
        if (userId) {
          const id = crypto.randomUUID();
          await kv.set(`report:${userId}:${id}`, {
            id, user_id: userId, rpe, is_continuous, sleep, notes: notesClean, text, model,
            created_at: new Date().toISOString(),
          });
        }
        return c.json({ text, model });
      }
      lastStatus = resp.status;
      lastErr = await resp.text();
      console.log(`Gemini model ${model} failed ${resp.status}:`, lastErr);
      const retryable = [429, 404, 500, 502, 503, 504];
      if (!retryable.includes(resp.status)) break;
      await new Promise((r) => setTimeout(r, 800));
    }
    if (lastStatus === 429) {
      return c.json({ error: "Gemini 무료 할당량이 소진되었습니다. 잠시 후 다시 시도하거나 결제 계정을 연결해 주세요." }, 429);
    }
    if (lastStatus === 503) {
      return c.json({ error: "Gemini 모델이 일시적으로 혼잡합니다. 잠시 후 다시 시도해 주세요." }, 503);
    }
    return c.json({ error: `Gemini API error ${lastStatus}: ${lastErr}` }, 500);
  } catch (err) {
    console.log("Error calling Gemini in POST /ai-coach:", err);
    return c.json({ error: `Failed to call AI coach: ${err}` }, 500);
  }
});

Deno.serve(app.fetch);
