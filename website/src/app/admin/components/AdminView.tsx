'use client';

import { useState } from 'react';
import { adminSignOut } from '../../actions';
import { CalendarGrid } from '../../[brand]/components/CalendarGrid';
import { AdGrid } from '../../[brand]/components/AdGrid';
import { RefPool } from '../../[brand]/components/RefPool';
import { PendingQueue } from '../../[brand]/components/PendingQueue';

const BRANDS = [
  { slug: 'island-splash', name: 'Island Splash', color: '#FF6B35' },
  { slug: 'cinco-h-ranch', name: 'Cinco H Ranch', color: '#B03030' },
];

const TIME_SLOTS = [
  { label: '9:00 AM', hour: 9, color: '#f97316' },
  { label: '5:00 PM', hour: 17, color: '#3b82f6' },
];

type Ad = { id: string; filename: string; path: string; product_name?: string; caption?: string; status?: string; created_at?: string };
type ScheduledPost = { id: string; ad_ids: string[]; caption: string; hashtags?: string; scheduled_at: string; platform: string; status: string };

export function AdminView({ islandAds, cincoAds, islandScheduled, cincoScheduled }: {
  islandAds: Ad[]; cincoAds: Ad[]; islandScheduled: ScheduledPost[]; cincoScheduled: ScheduledPost[];
}) {
  const [activeBrand, setActiveBrand] = useState('island-splash');
  const [showAll, setShowAll] = useState(false);
  const active = BRANDS.find(b => b.slug === activeBrand)!;
  const ads = activeBrand === 'island-splash' ? islandAds : cincoAds;
  const scheduled = activeBrand === 'island-splash' ? islandScheduled : cincoScheduled;
  const products = [...new Set(ads.map(a => a.product_name).filter(Boolean))];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 border-b border-white/10 sticky top-0 z-50 bg-black/80 backdrop-blur">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/50">Asset Ads</div>
          <h1 className="text-2xl font-bold">Admin</h1>
        </div>
        <form action={adminSignOut}>
          <button type="submit" className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:text-white hover:border-white/30 transition">
            Sign out
          </button>
        </form>
      </header>

      {/* Brand Tabs */}
      <div className="flex border-b border-white/10">
        {BRANDS.map(brand => (
          <button
            key={brand.slug}
            onClick={() => setActiveBrand(brand.slug)}
            className="flex-1 px-6 py-4 text-sm font-semibold transition relative"
            style={{
              borderBottom: activeBrand === brand.slug ? `3px solid ${brand.color}` : '3px solid transparent',
              color: activeBrand === brand.slug ? brand.color : 'rgba(255,255,255,0.4)',
              background: activeBrand === brand.slug ? `${brand.color}08` : 'transparent',
            }}
          >
            {brand.name}
          </button>
        ))}
      </div>

      <div className="px-6 py-8 max-w-5xl mx-auto">
        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="Ads in Pool" value={ads.length} sub={`${products.length} products`} color={active.color} />
          <StatCard label="Scheduled" value={scheduled.length} sub="pending + approved" color={active.color} />
          <StatCard label="Pool Status" value={ads.length >= 10 ? 'Ready' : ads.length >= 3 ? 'Filling' : 'Low'} sub={ads.length >= 10 ? 'Auto-gen enabled' : 'Add more refs'} color={ads.length >= 10 ? '#22c55e' : ads.length >= 3 ? '#facc15' : '#ef4444'} />
        </div>

        {/* Ref Pool */}
        <section className="mb-8 max-w-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs uppercase tracking-widest text-white/40">Ref Pool</h2>
          </div>
          <RefPool brand={activeBrand} brandColor={active.color} />
        </section>

        {/* Posts to Approve */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs uppercase tracking-widest text-white/40">Posts to Approve</h2>
            <span className="text-xs text-white/30">{active.name} · flat list, no clicks needed</span>
          </div>
          <PendingQueue brand={activeBrand} brandColor={active.color} />
        </section>

        {/* Divider */}
        <div className="border-t border-white/10 mb-8" />

        {/* Ad pool */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs uppercase tracking-widest text-white/40">Ad Pool</h2>
            <span className="text-xs text-white/30">{ads.length} ads available</span>
          </div>
          <AdGrid ads={ads} brand={activeBrand} brandColor={active.color} />
        </section>
      </div>
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
