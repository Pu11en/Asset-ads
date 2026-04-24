'use client';

import { useState, useEffect } from 'react';

type RefsManifest = {
  pools: Record<string, { images: string[]; usage_count: Record<string, number> }>;
  products: { name: string; slug: string }[];
  total: number;
};

type Props = {
  brand: string;
  brandColor: string;
};

export function RefPool({ brand, brandColor }: Props) {
  const [data, setData] = useState<RefsManifest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/refs/${brand}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [brand]);

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center gap-3">
        <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
        <span className="text-sm text-white/40">Loading ref pool…</span>
      </div>
    );
  }

  const total = data?.total ?? 0;
  const poolEntries = Object.entries(data?.pools ?? {});
  const poolStatus = total === 0 ? 'empty' : total < 5 ? 'low' : total < 10 ? 'filling' : 'ready';
  const statusColor = { empty: '#ef4444', low: '#facc15', filling: '#f97316', ready: '#22c55e' }[poolStatus];

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-widest text-white/40">Ref Pool</div>
        <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ backgroundColor: `${statusColor}20`, color: statusColor }}>
          {poolStatus.charAt(0).toUpperCase() + poolStatus.slice(1)}
        </span>
      </div>

      <div className="text-2xl font-bold mb-3" style={{ color: statusColor }}>{total}</div>

      {poolEntries.length === 0 ? (
        <p className="text-sm text-white/40">
          No refs yet. Send photos via Telegram → bot adds them to the pool.
        </p>
      ) : (
        <div className="space-y-3">
          {poolEntries.map(([productSlug, pool]) => (
            <div key={productSlug}>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-white/60 capitalize">{productSlug.replace(/-/g, ' ')}</span>
                <span className="text-white/40">{pool.images.length} refs</span>
              </div>
              {pool.images.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {pool.images.slice(0, 8).map((img, i) => (
                    <div key={i} className="w-10 h-10 rounded-lg bg-black/40 overflow-hidden border border-white/10">
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                  {pool.images.length > 8 && (
                    <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs text-white/40">
                      +{pool.images.length - 8}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {total > 0 && total < 10 && (
        <div className="mt-3 text-xs text-white/30 border-t border-white/5 pt-3">
          Add {10 - total} more refs to enable auto-generation
        </div>
      )}
      {total >= 10 && (
        <div className="mt-3 text-xs text-white/30 border-t border-white/5 pt-3">
          Auto-generation enabled · cron checks every 15 min
        </div>
      )}
    </div>
  );
}
