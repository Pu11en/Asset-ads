import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { readFile } from 'fs/promises';
import { getBrand } from '@/lib/brands';
import { getAdsForBrand } from '@/lib/ads';
import { loadScheduled } from '@/lib/scheduled';
import { signOut } from '../actions';
import { CalendarGrid } from './components/CalendarGrid';
import { PendingQueue } from './components/PendingQueue';
import { AdGrid } from './components/AdGrid';
import { BrandStats } from './components/BrandStats';
import { RefPool } from './components/RefPool';

export const dynamic = 'force-dynamic';

const BRAND_COLORS: Record<string, string> = {
  'island-splash': '#FF6B35',
  'cinco-h-ranch': '#B03030',
};

const TIME_SLOTS = [
  { label: '9:00 AM', hour: 9, color: '#f97316' },
  { label: '5:00 PM', hour: 17, color: '#3b82f6' },
];

export default async function BrandPage({
  params,
}: {
  params: Promise<{ brand: string }>;
}) {
  const { brand: slug } = await params;
  const brand = getBrand(slug);
  if (!brand) notFound();

  const jar = await cookies();
  const auth = jar.get('auth')?.value;
  if (auth !== slug) redirect('/');

  const ads = await getAdsForBrand(slug);
  const planned = await loadScheduled(slug);

  // Load ad approval state
  let approvalState: any = null;
  try {
    const raw = await readFile(`/home/drewp/asset-ads/output/ad-approval/${slug}.json`, 'utf8');
    approvalState = JSON.parse(raw);
  } catch { /* not found */ }

  // Filter out ads that are already assigned to the campaign calendar.
  const plannedIds = new Set<string>();
  for (const post of planned) {
    if (post.status !== 'rejected') {
      for (const id of post.ad_ids) plannedIds.add(id);
    }
  }
  const unusedAds = ads.filter(ad => !plannedIds.has(ad.filename));
  const brandColor = BRAND_COLORS[slug] ?? '#FF6B35';

  return (
    <main className="min-h-screen px-6 py-10 max-w-5xl mx-auto">
      {/* Header */}
      <header className="flex items-start justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/40 mb-1">Asset Ads</div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: brandColor }}>
            {brand.name}
          </h1>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/50 hover:text-white hover:border-white/30 transition"
          >
            Sign out
          </button>
        </form>
      </header>

      {/* Stats */}
      <BrandStats brand={slug} ads={ads} brandColor={brandColor} />

      {/* Ref Pool */}
      <div className="border-t border-white/10 mb-6 mt-6" />
      <h2 className="text-xs uppercase tracking-widest text-white/40 mb-4">Ref Pool</h2>
      <RefPool brand={slug} brandColor={brandColor} />

      {/* Campaign Calendar */}
      <div className="border-t border-white/10 mb-8 mt-6" />
      <h2 className="text-xs uppercase tracking-widest text-white/40 mb-4">Campaign Calendar</h2>
      <CalendarGrid brand={slug} brandColor={brandColor} timeSlots={TIME_SLOTS} />

      {/* Queue */}
      <div className="border-t border-white/10 mb-8 mt-6" />
      <h2 className="text-xs uppercase tracking-widest text-white/40 mb-4">Planning Queue</h2>
      <PendingQueue brand={slug} brandColor={brandColor} />

      {/* Divider */}
      <div className="border-t border-white/10 mb-8" />

      {/* Ad pool with approval */}
      <AdGrid
        ads={unusedAds}
        brand={slug}
        brandColor={brandColor}
        scheduledCount={plannedIds.size}
        approvalState={approvalState}
      />
    </main>
  );
}
