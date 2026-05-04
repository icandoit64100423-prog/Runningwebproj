import { useEffect, useState } from "react";
import { api, type News } from "../lib/api";
import { toast } from "sonner";
import { ImageWithFallback } from "./figma/ImageWithFallback";

export function NewsPage() {
  const [items, setItems] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listNews()
      .then((r) => setItems(r.news))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-neutral-400">Loading...</p>;
  if (items.length === 0) return <p className="text-neutral-400">뉴스가 없습니다.</p>;

  const [feature, ...rest] = items;

  return (
    <div className="space-y-8">
      {/* Featured */}
      <a href={feature.link} target="_blank" rel="noopener noreferrer"
        className="group grid md:grid-cols-[1.2fr_1fr] gap-0 bg-white rounded-3xl border border-neutral-200 overflow-hidden shadow-sm hover:shadow-xl transition">
        <div className="w-full aspect-[4/3] md:aspect-auto md:h-full overflow-hidden">
          <ImageWithFallback src={feature.thumbnail} alt={feature.title}
            className="w-full h-full object-cover" />
        </div>
        <div className="p-8 flex flex-col justify-between">
          <div>
            <span className="inline-block text-[10px] uppercase tracking-widest text-orange-600 mb-3">Featured · {feature.source}</span>
            <h3 className="tracking-tight mb-3" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 34, lineHeight: 1.1 }}>
              {feature.title}
            </h3>
            <p className="text-sm text-neutral-500">{feature.published_at}</p>
          </div>
          <div className="mt-6 inline-flex items-center gap-1 text-sm text-orange-600">
            Read story <span className="transition group-hover:translate-x-0.5">→</span>
          </div>
        </div>
      </a>

      {/* Grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((n) => (
          <a key={n.id} href={n.link} target="_blank" rel="noopener noreferrer"
            className="group bg-white rounded-3xl border border-neutral-200 overflow-hidden shadow-sm hover:shadow-lg hover:border-orange-300 transition">
            <div className="overflow-hidden aspect-[16/10]">
              <ImageWithFallback src={n.thumbnail} alt={n.title}
                className="w-full h-full object-cover transition duration-500 group-hover:scale-105" />
            </div>
            <div className="p-5">
              <div className="text-[10px] uppercase tracking-widest text-orange-600 mb-2">{n.source}</div>
              <h3 className="tracking-tight leading-snug line-clamp-2 mb-3" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22 }}>
                {n.title}
              </h3>
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>{n.published_at}</span>
                <span className="transition group-hover:translate-x-0.5">→</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
