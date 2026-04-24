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

type Props = {
  brand: string;
  brandColor: string;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function parseCaption(raw: string) {
  // caption may have \n  \n between lines
  const parts = raw.split(/\n\s*\n/);
  return {
    headline: parts[0] ?? raw,
    body: parts.slice(1).join('\n'),
  };
}

export function PendingQueue({ brand, brandColor }: Props) {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activePreview, setActivePreview] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/scheduled/${brand}`)
      .then(r => r.json())
      .then(data => {
        setPosts(data.posts ?? []);
        setLoading(false);
      });
  }, [brand]);

  const handleAction = async (blotatoId: string, action: 'approve' | 'reject') => {
    setActionLoading(blotatoId);
    try {
      const res = await fetch(`/api/scheduled/${brand}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, blotato_id: blotatoId }),
      });
      if (res.ok) {
        const refresh = await fetch(`/api/scheduled/${brand}`).then(r => r.json());
        setPosts(refresh.posts ?? []);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const actionable = posts.filter(p => p.status === 'pending' || p.status === 'preapproved');
  const past = posts.filter(p => p.status !== 'pending' && p.status !== 'preapproved');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {actionable.length === 0 && past.length === 0 && (
        <div className="text-center py-16 text-white/40 text-sm rounded-2xl border border-white/10 bg-white/5">
          No planned posts yet.
        </div>
      )}

      {/* Actionable planned posts */}
      {actionable.map((post, idx) => {
        const { headline, body } = parseCaption(post.caption);
        const isActive = activePreview === idx;

        return (
          <div
            key={post.id}
            className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
          >
            {/* Header row */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-white/90">
                  {formatDate(post.scheduled_at)}
                </span>
                <span className="text-xs text-white/40">{timeLabel(post.scheduled_at)}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                  {post.status === 'preapproved' ? 'preapproved' : post.slot}
                </span>
                <span className="text-xs text-white/30">{post.ad_ids.length} slides</span>
              </div>
              <button
                onClick={() => setActivePreview(isActive ? null : idx)}
                className="text-xs border border-white/10 px-3 py-1 rounded-lg text-white/50 hover:text-white hover:border-white/30 transition"
              >
                {isActive ? 'Hide' : 'Preview'} carousel
              </button>
            </div>

            {/* Carousel preview */}
            {isActive && (
              <div className="relative bg-black/40">
                <div className="flex gap-2 p-4 overflow-x-auto scrollbar-hide">
                  {post.ad_ids.map((id, slideIdx) => (
                    <div key={slideIdx} className="flex-shrink-0 w-32">
                      <div className="relative aspect-square rounded-xl overflow-hidden bg-black/60 border border-white/10">
                        <img
                          src={`/images/ads/${brand}/${id}`}
                          alt={`Slide ${slideIdx + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const el = e.target as HTMLImageElement;
                            el.style.display = 'none';
                            el.parentElement?.classList.add('bg-red-900/20');
                          }}
                        />
                        <span className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-white/60">
                          {slideIdx + 1}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Caption + hashtags */}
            <div className="px-5 py-4">
              <p className="text-white/90 text-base leading-relaxed whitespace-pre-line">{headline}</p>
              {body && (
                <p className="text-white/50 text-sm mt-1 whitespace-pre-line">{body}</p>
              )}
              <p className="text-white/30 text-xs mt-2 font-mono">{post.hashtags}</p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={() => handleAction(post.blotato_id, 'approve')}
                disabled={actionLoading === post.blotato_id}
                className="flex-1 rounded-xl py-3 text-base font-semibold bg-green-600 hover:bg-green-500 text-white disabled:opacity-40 transition flex items-center justify-center gap-2"
              >
                {actionLoading === post.blotato_id ? (
                  <div className="w-4 h-4 border border-white/30 border-t-white/80 rounded-full animate-spin" />
                ) : (
                  <>✓ Approve</>
                )}
              </button>
              <button
                onClick={() => handleAction(post.blotato_id, 'reject')}
                disabled={actionLoading === post.blotato_id}
                className="flex-1 rounded-xl py-3 text-base font-semibold bg-red-600/80 hover:bg-red-500/80 text-white disabled:opacity-40 transition flex items-center justify-center gap-2"
              >
                ✗ Reject
              </button>
            </div>
          </div>
        );
      })}

      {/* Archived planning items — compact row */}
      {past.length > 0 && (
        <details className="group">
          <summary className="text-xs uppercase tracking-widest text-white/40 cursor-pointer hover:text-white/60 list-none flex items-center gap-2 pb-3">
            <span className="transition group-open:rotate-90">▶</span>
            {past.length} past post{past.length !== 1 ? 's' : ''}
          </summary>
          <div className="space-y-2">
            {past.map(post => {
              const { headline } = parseCaption(post.caption);
              const statusBadge = {
                preapproved: 'text-yellow-300 bg-yellow-500/20',
                approved: 'text-green-400 bg-green-500/20',
                rejected: 'text-red-400 bg-red-500/20',
                posted: 'text-blue-400 bg-blue-500/20',
              }[post.status] ?? 'text-white/40 bg-white/10';
              return (
                <div
                  key={post.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 opacity-60"
                >
                  <div className="flex gap-1 flex-shrink-0">
                    {post.ad_ids.slice(0, 3).map((id, i) => (
                      <img
                        key={i}
                        src={`/images/ads/${brand}/${id}`}
                        alt=""
                        className="w-8 h-8 rounded-lg object-cover bg-black/40"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/70 truncate">{headline}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">{formatDate(post.scheduled_at)}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${statusBadge}`}>
                    {post.status}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
