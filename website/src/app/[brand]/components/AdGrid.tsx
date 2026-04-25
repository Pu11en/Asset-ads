'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

type Ad = {
  id: string;
  filename: string;
  path: string;
  product_name?: string;
  caption?: string;
  created_at?: string;
};

type ApprovalState = {
  pending_count: number;
  approved_count: number;
  skipped_count: number;
  ads: Record<string, { status: string; filename: string; reviewed_at: string | null }>;
};

type Props = {
  ads: Ad[];
  brand: string;
  brandColor: string;
  approvalState?: ApprovalState | null;
};

export function AdGrid({ ads, brand, brandColor, approvalState }: Props) {
  const [localApproval, setLocalApproval] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [imageError, setImageError] = useState<Record<string, boolean>>({});

  // Sync local state from approvalState prop
  useEffect(() => {
    if (!approvalState) return;
    const updates: Record<string, string> = {};
    for (const [id, ad] of Object.entries(approvalState.ads)) {
      if (ad.status !== 'pending') updates[id] = ad.status;
    }
    setLocalApproval(prev => ({ ...prev, ...updates }));
  }, [approvalState]);

  const getStatus = (adId: string): string => {
    return localApproval[adId] ?? approvalState?.ads[adId]?.status ?? 'pending';
  };

  const handleAction = async (adId: string, action: 'approve' | 'skip' | 'reset') => {
    setLoading(adId);
    try {
      const res = await fetch('/api/ads-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, adId, action }),
      });
      const data = await res.json();
      if (data.success) {
        const newStatus = action === 'approve' ? 'approved' : action === 'skip' ? 'skipped' : 'pending';
        setLocalApproval(prev => ({ ...prev, [adId]: newStatus }));
      }
    } finally {
      setLoading(null);
    }
  };

  const counts = {
    pending: approvalState?.pending_count ?? ads.length,
    approved: approvalState?.approved_count ?? 0,
    skipped: approvalState?.skipped_count ?? 0,
  };

  return (
    <div>
      {/* Status bar */}
      <div className="flex items-center gap-4 mb-6 p-4 rounded-2xl bg-white/5 border border-white/10">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-yellow-400" />
          <span className="text-sm text-white/70">{counts.pending} pending</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-400" />
          <span className="text-sm text-white/70">{counts.approved} approved</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-white/20" />
          <span className="text-sm text-white/70">{counts.skipped} skipped</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {counts.pending === 0 ? (
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
              <span>✓ All reviewed</span>
            </div>
          ) : (
            <span className="text-white/30 text-sm">
              {counts.approved} approved · {counts.pending} pending
            </span>
          )}
        </div>
      </div>

      {/* Review Grid — 3 columns, large cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ads.map(ad => {
          const status = getStatus(ad.id);
          const isLoading = loading === ad.id;
          const isPending = status === 'pending';
          const isApproved = status === 'approved';
          const isSkipped = status === 'skipped';
          const hasError = imageError[ad.id];

          return (
            <div
              key={ad.id}
              className={`rounded-2xl border overflow-hidden transition-all ${
                isApproved
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : isSkipped
                  ? 'border-white/10 bg-white/5 opacity-50'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              {/* Image — large */}
              <div className="relative aspect-square bg-black/60">
                {hasError ? (
                  <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">
                    Image unavailable
                  </div>
                ) : (
                  <Image
                    src={ad.path}
                    alt={ad.product_name ?? ad.id}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-cover"
                    onError={() => setImageError(prev => ({ ...prev, [ad.id]: true }))}
                  />
                )}

                {/* Status badge overlay */}
                {isApproved && (
                  <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-emerald-500/90 text-white text-xs font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-white" />
                    Approved
                  </div>
                )}
                {isSkipped && (
                  <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-white/20 text-white/70 text-xs font-medium">
                    Skipped
                  </div>
                )}
                {isPending && (
                  <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-yellow-400/90 text-black text-xs font-semibold">
                    Pending
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <p className="text-sm font-medium text-white/80 truncate mb-1">
                  {ad.product_name ?? ad.filename}
                </p>
                <p className="text-xs text-white/30 font-mono truncate mb-4">{ad.filename}</p>

                {/* Action buttons */}
                {isPending && (
                  <div className="flex gap-2">
                    <button
                      disabled={isLoading}
                      onClick={() => handleAction(ad.id, 'approve')}
                      className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold transition flex items-center justify-center gap-2"
                    >
                      <span className="text-lg">✓</span> Approve
                    </button>
                    <button
                      disabled={isLoading}
                      onClick={() => handleAction(ad.id, 'skip')}
                      className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white/70 text-sm font-medium transition border border-white/10"
                    >
                      Skip
                    </button>
                  </div>
                )}

                {(isApproved || isSkipped) && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/40">
                      {isApproved ? '✓ Approved' : '○ Skipped'}
                    </span>
                    <button
                      disabled={isLoading}
                      onClick={() => handleAction(ad.id, 'reset')}
                      className="text-xs text-white/30 hover:text-white/60 transition disabled:opacity-50"
                    >
                      {isLoading ? '…' : 'undo'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
