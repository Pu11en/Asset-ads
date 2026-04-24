'use client';

import { useState, useEffect } from 'react';

type ScheduledPost = {
  id: string;
  blotato_id: string;
  ad_ids: string[];
  caption: string;
  hashtags: string;
  scheduled_at: string;
  slot: '9am' | '5pm';
  platform: string;
  status: string;
};

type Ad = {
  id: string;
  filename: string;
  path: string;
  product_name?: string;
  caption?: string;
  status?: string;
  created_at?: string;
};

type Props = {
  brand: string;
  ads: Ad[];
  brandColor: string;
};

export function BrandStats({ brand, ads, brandColor }: Props) {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);

  useEffect(() => {
    fetch(`/api/scheduled/${brand}`)
      .then(r => r.json())
      .then(d => setPosts(d.posts ?? []));
  }, [brand]);

  const planned = posts.filter(p => p.status !== 'rejected');
  const posted = posts.filter(p => p.status === 'posted');
  const rejected = posts.filter(p => p.status === 'rejected');

  const products = [...new Set(ads.map(a => a.product_name).filter(Boolean))];
  const latestAd = ads[0];

  const nextPost = planned
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
      <StatCard
        label="Total Ads"
        value={ads.length}
        sub={`${products.length} products`}
        color={brandColor}
      />
      <StatCard
        label="Planned"
        value={planned.length}
        sub="calendar entries"
        color={brandColor}
      />
      <StatCard label="Posted" value={posted.length} sub="live posts" color="#22c55e" />
      <StatCard
        label="Rejected"
        value={rejected.length}
        sub="not approved"
        color="#ef4444"
      />
      <StatCard
        label="Pool Status"
        value={ads.length >= 100 ? 'Ready' : ads.length >= 25 ? 'Building' : 'Low'}
        sub={ads.length >= 100 ? `${ads.length} ads in library` : 'Build toward 100 ads'}
        color={ads.length >= 100 ? '#22c55e' : ads.length >= 25 ? '#f97316' : '#ef4444'}
      />

      {nextPost && (
        <div className="col-span-2 sm:col-span-3 lg:col-span-5 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-widest text-white/40 mb-2">Next Planned Post</div>
          <div className="flex items-center gap-4">
            <div className="flex gap-1">
              {nextPost.ad_ids.slice(0, 3).map((id, i) => (
                <div key={i} className="w-10 h-10 rounded-lg bg-black/40 overflow-hidden border border-white/10">
                  <img src={`/images/ads/${brand}/${id}`} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white/80 truncate">{nextPost.caption}</div>
              <div className="text-xs text-white/40 mt-0.5">
                {new Date(nextPost.scheduled_at).toLocaleDateString()} at {nextPost.slot === '9am' ? '9:00 AM' : '5:00 PM'}
              </div>
            </div>
            <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: `${brandColor}20`, color: brandColor }}>
              {nextPost.status}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs uppercase tracking-widest text-white/40 mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-xs text-white/40 mt-0.5">{sub}</div>
    </div>
  );
}
