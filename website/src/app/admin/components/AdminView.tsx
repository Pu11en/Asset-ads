'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { adminSignOut } from '../../actions';

const BRANDS = [
  { slug: 'island-splash', name: 'Island Splash', color: '#FF6B35' },
  { slug: 'cinco-h-ranch', name: 'Cinco H Ranch', color: '#B03030' },
];

type Ad = { id: string; filename: string; path: string; product_name?: string; caption?: string };
type Post = {
  post_id: string; ad_filenames: string[]; caption: string; hashtags?: string;
  scheduled?: boolean; scheduledAt?: string; blotatoPostId?: string; scheduledTime?: string;
  status?: string; post_type?: string; _filename?: string; _brand?: string;
  blotatoStatus?: string; publicUrl?: string; errorMessage?: string; _archived?: boolean;
};
type ApprovalState = {
  pending_count: number; approved_count: number; skipped_count: number;
  ads: Record<string, { status: string; filename: string; reviewed_at: string | null }>;
};

export function AdminView({
  islandAds, cincoAds, islandApproval, cincoApproval,
}: {
  islandAds: Ad[]; cincoAds: Ad[];
  islandApproval: ApprovalState | null; cincoApproval: ApprovalState | null;
}) {
  const [activeBrand, setActiveBrand] = useState('island-splash');
  const [posts, setPosts] = useState<Post[]>([]);
  const [localApproval, setLocalApproval] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [imageError, setImageError] = useState<Record<string, boolean>>({});
  const [archiveCollapsed, setArchiveCollapsed] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const active = BRANDS.find(b => b.slug === activeBrand)!;
  const ads = activeBrand === 'island-splash' ? islandAds : cincoAds;
  const approval = activeBrand === 'island-splash' ? islandApproval : cincoApproval;

  // Compute next AM/PM slot for a given draft index
  const pickSlot = (idx: number) => {
    const now = new Date();
    const isAM = idx % 2 === 0;
    const base = new Date(now);
    base.setDate(base.getDate() + 1 + Math.floor(idx / 2));
    base.setHours(isAM ? 9 : 14, 0, 0, 0);
    const label = base.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
      (isAM ? ' at 9 AM' : ' at 2 PM');
    return { mode: isAM ? 'am' : 'pm', label };
  };

  // Load posts + fetch real Blotato status for scheduled ones
  useEffect(() => {
    fetch(`/api/posts?brand=${activeBrand}`)
      .then(r => r.json())
      .then(async (data) => {
        const batches = data.posts || [];
        if (!batches.length) { setPosts([]); return; }
        const latestBatch = batches[0];
        let loaded: Post[] = (latestBatch.posts || []).map((p: any) => ({
          ...p, _filename: latestBatch.filename, _brand: latestBatch.brand,
        }));
        // Merge live Blotato status for any scheduled posts
        loaded = await Promise.all(loaded.map(async (p) => {
          if (p.scheduled && p.blotatoPostId) {
            try {
              const r = await fetch(`/api/post-status?blotatoId=${p.blotatoPostId}`);
              const d = await r.json();
              return { ...p, blotatoStatus: d.status, publicUrl: d.publicUrl || p.publicUrl };
            } catch { return p; }
          }
          return p;
        }));
        setPosts(loaded);
      })
      .catch(() => {});
  }, [activeBrand]);

  // Sync approval states
  useEffect(() => {
    if (!approval) return;
    const updates: Record<string, string> = {};
    for (const [id, ad] of Object.entries(approval.ads)) {
      if (ad.status !== 'pending') updates[id] = ad.status;
    }
    setLocalApproval(prev => ({ ...prev, ...updates }));
  }, [approval]);

  const getAdStatus = (adId: string) =>
    localApproval[adId] ?? approval?.ads[adId]?.status ?? 'pending';

  const handleAdAction = async (adId: string, action: 'approve' | 'skip' | 'reset') => {
    setLoading(adId);
    try {
      const res = await fetch('/api/ads-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: activeBrand, adId, action }),
      });
      if (res.ok || res.status === 200) {
        const newStatus = action === 'approve' ? 'approved' : action === 'skip' ? 'skipped' : 'pending';
        setLocalApproval(prev => ({ ...prev, [adId]: newStatus }));
      }
    } finally { setLoading(null); }
  };

  // Drag-to-reorder drafts
  const movePost = (fromIdx: number, direction: 'up' | 'down') => {
    const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1;
    if (toIdx < 0 || toIdx >= posts.length) return;
    const reordered = [...posts];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setPosts(reordered);
    saveOrder(reordered);
  };

  const saveOrder = async (updatedPosts: Post[]) => {
    const filename = updatedPosts[0]?._filename;
    if (!filename) return;
    try {
      await fetch('/api/posts/reorder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: activeBrand, filename, posts: updatedPosts }),
      });
    } catch {}
  };

  const handleSchedule = async (post: Post, idx: number) => {
    const { mode, label } = pickSlot(idx);
    if (!confirm(`Schedule for ${label}?`)) return;
    setLoading(`schedule-${post.post_id}`);
    try {
      const res = await fetch('/api/schedule-post', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: post._brand || activeBrand, post_id: post.post_id, mode }),
      });
      const data = await res.json();
      if (data.success) {
        setPosts(prev => prev.map(p =>
          p.post_id === post.post_id
            ? { ...p, scheduled: true, scheduledAt: data.scheduledAt, scheduledTime: data.scheduledTime, blotatoPostId: data.blotatoPostId }
            : p
        ));
      } else {
        alert(`Failed: ${data.error}\n${(data.details || []).join('\n')}`);
      }
    } catch (e: any) { alert(`Error: ${e.message}`); }
    finally { setLoading(null); }
  };

  const handleUndo = async (post: Post) => {
    if (!confirm('Move this post back to drafts?')) return;
    setLoading(`undo-${post.post_id}`);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.post_id, brand: post._brand || activeBrand, filename: post._filename, action: 'undo_schedule' }),
      });
      if (res.ok) {
        setPosts(prev => prev.map(p =>
          p.post_id === post.post_id
            ? { ...p, scheduled: false, blotatoPostId: undefined, scheduledAt: undefined, scheduledTime: undefined, blotatoStatus: undefined, publicUrl: undefined }
            : p
        ));
      }
    } finally { setLoading(null); }
  };

  // Archive = published on Instagram (blotatoStatus=published OR _archived=true with a publicUrl)
  const published = posts.filter(p =>
    p.blotatoStatus === 'published' || (p._archived && p.publicUrl)
  );
  // Scheduled = sent to Blotato but not yet published
  const scheduled = posts.filter(p => p.scheduled && p.blotatoStatus !== 'published' && !p._archived);
  // Drafts = not yet scheduled
  const drafts = posts.filter(p => !p.scheduled && !p._archived && p.blotatoStatus !== 'published');

  // Compute counts from the ads object (approval JSON has ads as Record<key, {status}>)
  const adStatuses = Object.values(approval?.ads ?? {}).map(a => a.status);
  const pendingCount = adStatuses.filter(s => s === 'pending').length;
  const approvedCount = adStatuses.filter(s => s === 'approved').length;
  const skippedCount = adStatuses.filter(s => s === 'skipped').length;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 z-50 bg-black/80 backdrop-blur">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-white/50">Asset Ads</div>
            <h1 className="text-xl font-bold">Admin</h1>
          </div>
          <nav className="flex items-center gap-1 ml-4">
            <Link href="/admin" className="px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-md transition">Ad Pool</Link>
            <Link href="/admin/gallery/island-splash/drinks" className="px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-md transition">Ref Gallery</Link>
            <Link href="/admin/gallery/island-splash/drinks/approved" className="px-3 py-1.5 text-xs font-medium text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-md transition">✓ Approved (3)</Link>
            <Link href="/admin/posts" className="px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-md transition">Posts</Link>
          </nav>
        </div>
        <form action={adminSignOut}>
          <button type="submit" className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:text-white hover:border-white/30 transition">Sign out</button>
        </form>
      </header>

      {/* Brand tabs */}
      <div className="flex border-b border-white/10">
        {BRANDS.map(brand => (
          <button key={brand.slug} onClick={() => setActiveBrand(brand.slug)}
            className="flex-1 px-6 py-4 text-sm font-semibold transition"
            style={{
              borderBottom: activeBrand === brand.slug ? `3px solid ${brand.color}` : '3px solid transparent',
              color: activeBrand === brand.slug ? brand.color : 'rgba(255,255,255,0.4)',
              background: activeBrand === brand.slug ? `${brand.color}08` : 'transparent',
            }}>
            {brand.name}
          </button>
        ))}
      </div>

      <div className="px-6 py-8 max-w-5xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <StatCard label="Ads in Pool" value={ads.length} sub={`${ads.length} total`} color={active.color} />
          <StatCard label="Draft Posts" value={drafts.length} sub={drafts.length === 0 ? 'all posted' : 'ready to schedule'} color={active.color} />
          <StatCard
            label="Library"
            value={approvedCount > 0 ? `${approvedCount} approved` : 'Reviewing'}
            sub={`${pendingCount} pending · ${skippedCount} skipped`}
            color={approvedCount > 0 ? '#22c55e' : '#f97316'}
          />
        </div>

        {/* === DRAFTS (drag-to-reorder) === */}
        {drafts.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs uppercase tracking-widest text-white/40 mb-4">Ready to Schedule — ↑↓ to reorder</h2>
            <div className="space-y-2">
              {drafts.map((post, idx) => (
                <DraftCard
                  key={post.post_id}
                  post={post}
                  idx={idx}
                  total={drafts.length}
                  slotPreview={pickSlot(idx).label}
                  onSchedule={() => handleSchedule(post, idx)}
                  onMoveUp={() => movePost(idx, 'up')}
                  onMoveDown={() => movePost(idx, 'down')}
                  loading={loading === `schedule-${post.post_id}`}
                  activeBrand={activeBrand}
                  posts={posts}
                  setPosts={setPosts}
                  saveOrder={saveOrder}
                  setLightboxUrl={setLightboxUrl}
                />
              ))}
            </div>
          </section>
        )}

        {drafts.length > 0 && scheduled.length > 0 && <div className="border-t border-white/10 my-8" />}

        {/* === SCHEDULED === */}
        {scheduled.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs uppercase tracking-widest text-blue-400/60 mb-4">⏳ Scheduled ({scheduled.length})</h2>
            <div className="space-y-2">
              {scheduled.map(post => (
                <div key={post.post_id} className="rounded-xl border border-blue-500/30 bg-blue-500/5 overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs text-blue-400">⏳</span>
                      <span className="text-sm text-white/70 truncate">{post.caption?.slice(0, 60)}{post.caption && post.caption.length > 60 ? '…' : ''}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-blue-400/60">{post.scheduledTime || post.scheduledAt}</span>
                      <button onClick={() => handleUndo(post)} className="text-xs text-white/30 hover:text-white/60 transition">← Undo</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {drafts.length > 0 && published.length > 0 && <div className="border-t border-white/10 my-8" />}

        {/* === ARCHIVE === */}
        {published.length > 0 && (
          <section className="mb-8">
            <button onClick={() => setArchiveCollapsed(!archiveCollapsed)} className="flex items-center justify-between w-full mb-4">
              <h2 className="text-xs uppercase tracking-widest text-emerald-400/60">✓ Posted ({published.length})</h2>
              <span className="text-xs text-white/30">{archiveCollapsed ? '▶' : '▼'}</span>
            </button>
            {!archiveCollapsed && (
              <div className="space-y-3">
                {published.map(post => (
                  <ArchiveCard key={post.post_id} post={post} onUndo={() => handleUndo(post)} loading={loading === `undo-${post.post_id}`} activeBrand={activeBrand} setLightboxUrl={setLightboxUrl} />
                ))}
              </div>
            )}
          </section>
        )}

        {drafts.length === 0 && published.length === 0 && (
          <p className="text-sm text-white/30 text-center py-12">No posts yet. Tell Hermes to compose.</p>
        )}

        <div className="border-t border-white/10 my-8" />

        {/* === AD POOL === */}
        <section>
          <h2 className="text-xs uppercase tracking-widest text-white/40 mb-4">Ad Pool — {active.name}</h2>
          <div className="flex items-center gap-6 mb-6 p-4 rounded-2xl bg-white/5 border border-white/10 text-sm">
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-400" /><span className="text-white/70">{pendingCount} pending</span></div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-400" /><span className="text-white/70">{approvedCount} approved</span></div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-white/20" /><span className="text-white/70">{skippedCount} skipped</span></div>
            {pendingCount === 0 && <span className="ml-auto text-emerald-400 text-sm font-medium">✓ All reviewed</span>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ads
              .filter(ad => getAdStatus(ad.id) === 'pending')
              .map(ad => (
                <div key={ad.id} className="rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 overflow-hidden transition-all">
                  <div className="relative aspect-square bg-black/60">
                    {imageError[ad.id]
                      ? <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">Image unavailable</div>
                      : <Image src={ad.path} alt={ad.product_name ?? ad.id} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" onError={() => setImageError(prev => ({ ...prev, [ad.id]: true }))} />
                    }
                    <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-yellow-400/90 text-black text-xs font-semibold">Pending</div>
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-medium text-white/80 truncate mb-1">{ad.product_name ?? ad.filename}</p>
                    <p className="text-xs text-white/30 font-mono truncate mb-4">{ad.filename}</p>
                    <div className="flex gap-2">
                      <button disabled={loading === ad.id} onClick={() => handleAdAction(ad.id, 'approve')}
                        className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold transition flex items-center justify-center gap-2">
                        <span>✓</span> Approve
                      </button>
                      <button disabled={loading === ad.id} onClick={() => handleAdAction(ad.id, 'skip')}
                        className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white/70 text-sm font-medium transition border border-white/10">Skip</button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90" onClick={() => setLightboxUrl(null)}>
          <div className="relative max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightboxUrl} alt="Full size" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
            <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 text-white/60 hover:text-white text-3xl leading-none p-2">×</button>
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

function DraftCard({ post, idx, total, slotPreview, onSchedule, onMoveUp, onMoveDown, loading, activeBrand, posts, setPosts, saveOrder, setLightboxUrl }: {
  post: Post; idx: number; total: number; slotPreview: string; onSchedule: () => void;
  onMoveUp: () => void; onMoveDown: () => void;
  loading: boolean; activeBrand: string;
  posts: Post[];
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  saveOrder: (updatedPosts: Post[]) => void;
  setLightboxUrl: (url: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const imageUrls = post.ad_filenames.map(fn => `/images/ads/${activeBrand}/${fn.replace(/\.(instructions|json|png|jpg|webp)$/, '')}.png`);

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${expanded ? 'border-white/20 bg-white/5' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
      <div className="px-4 py-3 flex items-center justify-between text-left">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-3 min-w-0 flex-1 hover:bg-white/5 rounded transition">
          <span className="text-white/20 select-none text-sm">⋮⋮</span>
          <span className="text-xs text-white/30 flex-shrink-0">{imageUrls.length}🎠</span>
          <span className="text-sm text-white/70 truncate">{post.caption?.slice(0, 60)}{post.caption && post.caption.length > 60 ? '…' : ''}</span>
        </button>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {idx > 0 && (
            <button onClick={e => { e.stopPropagation(); onMoveUp(); }} className="px-2 py-1 text-xs text-white/40 hover:text-white/70 transition rounded bg-white/5 hover:bg-white/10">↑</button>
          )}
          {idx < total - 1 && (
            <button onClick={e => { e.stopPropagation(); onMoveDown(); }} className="px-2 py-1 text-xs text-white/40 hover:text-white/70 transition rounded bg-white/5 hover:bg-white/10">↓</button>
          )}
          <span className="text-xs text-blue-400/70 hidden sm:block">{slotPreview}</span>
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-white/30 hover:text-white/60 transition px-1">{expanded ? '▲' : '▼'}</button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-white/5">
          <div className="flex gap-1 overflow-x-auto py-3">
            {imageUrls.map((url, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0">
                <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-black/60 group">
                  {/* Image — click for lightbox */}
                  <img
                    src={url} alt={`img-${i}`}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setLightboxUrl(url)}
                    onError={e => (e.target as HTMLImageElement).style.display = 'none'}
                  />
                  {/* Number badge */}
                  <div className="absolute bottom-0 right-0 bg-black/60 text-white text-[10px] px-1">{i + 1}</div>
                  {/* Reorder arrows — overlay on hover */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition gap-0.5 pointer-events-none">
                    {i > 0 && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          e.preventDefault();
                          const newFilenames = [...post.ad_filenames];
                          [newFilenames[i - 1], newFilenames[i]] = [newFilenames[i], newFilenames[i - 1]];
                          const newPosts = posts.map(p => p.post_id === post.post_id ? { ...p, ad_filenames: newFilenames } : p);
                          setPosts(newPosts);
                          saveOrder(newPosts);
                        }}
                        className="px-2 py-1 bg-black/70 text-white text-xs rounded hover:bg-black/90 font-bold pointer-events-auto"
                      >←</button>
                    )}
                    {i < imageUrls.length - 1 && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          e.preventDefault();
                          const newFilenames = [...post.ad_filenames];
                          [newFilenames[i], newFilenames[i + 1]] = [newFilenames[i + 1], newFilenames[i]];
                          const newPosts = posts.map(p => p.post_id === post.post_id ? { ...p, ad_filenames: newFilenames } : p);
                          setPosts(newPosts);
                          saveOrder(newPosts);
                        }}
                        className="px-2 py-1 bg-black/70 text-white text-xs rounded hover:bg-black/90 font-bold pointer-events-auto"
                      >→</button>
                    )}
                  </div>
                </div>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    const newFilenames = post.ad_filenames.filter((_: string, idx: number) => idx !== i);
                    const newPosts = posts.map(p => p.post_id === post.post_id ? { ...p, ad_filenames: newFilenames } : p);
                    setPosts(newPosts);
                    saveOrder(newPosts);
                  }}
                  className="w-20 py-1 rounded-lg bg-white/10 hover:bg-red-600/80 text-white/60 hover:text-white text-xs font-medium transition border border-white/10"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <p className="text-sm text-white/80 whitespace-pre-wrap mb-2">{post.caption}</p>
          {post.hashtags && <p className="text-xs text-white/30 mb-3">{post.hashtags}</p>}
          <button disabled={loading} onClick={onSchedule}
            className="mt-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold transition">
            {loading ? '◌ Scheduling…' : `✓ Schedule — ${slotPreview}`}
          </button>
        </div>
      )}
    </div>
  );
}

function ArchiveCard({ post, onUndo, loading, activeBrand, setLightboxUrl }: { post: Post; onUndo: () => void; loading: boolean; activeBrand: string; setLightboxUrl: (url: string) => void; }) {
  const [expanded, setExpanded] = useState(false);
  const imageUrls = post.ad_filenames.map(fn => `/images/ads/${activeBrand}/${fn.replace(/\.(instructions|json|png|jpg|webp)$/, '')}.png`);

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between text-left">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-3 min-w-0 flex-1 hover:bg-white/5 rounded transition">
          <span className="text-xs text-emerald-400">✓ Posted</span>
          <span className="text-sm text-white/70 truncate">{post.caption?.slice(0, 60)}{post.caption && post.caption.length > 60 ? '…' : ''}</span>
        </button>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          {post.publicUrl && (
            <a href={post.publicUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300">View →</a>
          )}
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-white/30 hover:text-white/60 transition px-1">{expanded ? '▲' : '▼'}</button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-white/5">
          <div className="flex gap-1 overflow-x-auto py-3">
            {imageUrls.map((url, i) => (
              <div key={i} className="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-black/60 cursor-pointer"
                  onClick={() => setLightboxUrl(url)}>
                <img src={url} alt={`img-${i}`} className="w-full h-full object-cover pointer-events-none"
                  onError={e => (e.target as HTMLImageElement).style.display = 'none'} />
              </div>
            ))}
          </div>
          <p className="text-sm text-white/80 whitespace-pre-wrap mb-2">{post.caption}</p>
          {post.blotatoPostId && <p className="text-xs text-white/30 font-mono mb-3">ID: {post.blotatoPostId}</p>}
          <button onClick={onUndo} disabled={loading} className="text-xs text-white/30 hover:text-white/60 transition disabled:opacity-50">
            {loading ? '…' : '← Use again'}
          </button>
        </div>
      )}
    </div>
  );
}
