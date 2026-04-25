"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";

type Ref = {
  filename: string;
  path: string;
  url: string;
};

type PoolData = {
  brand: string;
  category: string;
  pool_dir: string;
  refs: {
    unapproved: Ref[];
    approved: number;
    rejected: number;
    used: number;
    total_unapproved: number;
  };
  state: {
    approved: number;
    rejected: number;
    used: number;
    trigger_threshold: number;
    triggered: boolean;
  };
};

export default function SwipePage() {
  const params = useParams();
  const router = useRouter();
  const brand = params.brand as string;
  const category = params.category as string;

  const [data, setData] = useState<PoolData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/swipe/${brand}/${category}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to fetch refs:", err);
    } finally {
      setLoading(false);
    }
  }, [brand, category]);

  useEffect(() => {
    fetchRefs();
  }, [fetchRefs]);

  const toggleSelect = (filename: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(filename)) {
      newSelected.delete(filename);
    } else {
      newSelected.add(filename);
    }
    setSelected(newSelected);
  };

  const selectAll = () => {
    if (!data) return;
    const allFilenames = new Set(data.refs.unapproved.map(r => r.filename));
    setSelected(allFilenames);
  };

  const deselectAll = () => {
    setSelected(new Set());
  };

  const handleApprove = async () => {
    if (selected.size === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/swipe/${brand}/${category}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filenames: Array.from(selected) }),
      });
      if (res.ok) {
        const result = await res.json();
        console.log("Approved:", result);
        setSelected(new Set());
        fetchRefs();
      }
    } catch (err) {
      console.error("Failed to approve:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (filename?: string) => {
    const toReject = filename ? [filename] : Array.from(selected);
    if (toReject.length === 0) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/swipe/${brand}/${category}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filenames: toReject }),
      });
      if (res.ok) {
        const result = await res.json();
        console.log("Rejected:", result);
        if (filename) {
          setSelected(prev => {
            const next = new Set(prev);
            next.delete(filename);
            return next;
          });
        } else {
          setSelected(new Set());
        }
        fetchRefs();
      }
    } catch (err) {
      console.error("Failed to reject:", err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Loading refs...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-white/60">Failed to load refs</p>
      </div>
    );
  }

  const refs = data.refs.unapproved;
  const state = data.state;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/90 backdrop-blur border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push("/admin")}
                className="text-white/60 hover:text-white transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-lg font-semibold capitalize">{brand}</h1>
                <p className="text-sm text-white/60">{category}</p>
              </div>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-6 text-sm">
              <span className="text-emerald-400">{state.approved} approved</span>
              <span className="text-red-400">{state.rejected} rejected</span>
              <span className="text-white/60">{refs.length} remaining</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={selectAll}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition"
            >
              Select All ({refs.length})
            </button>
            <button
              onClick={deselectAll}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/60 transition"
            >
              Deselect All
            </button>
            <div className="flex-1" />
            <span className="text-sm text-white/60">
              {selected.size} selected
            </span>
            <button
              onClick={handleApprove}
              disabled={selected.size === 0 || actionLoading}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition"
            >
              {actionLoading ? "Approving..." : `Approve Selected (${selected.size})`}
            </button>
            <button
              onClick={() => handleReject()}
              disabled={selected.size === 0 || actionLoading}
              className="px-6 py-2 bg-red-600/50 hover:bg-red-600 disabled:bg-red-600/30 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition"
            >
              {actionLoading ? "Rejecting..." : `Reject Selected (${selected.size})`}
            </button>
          </div>
        </div>
      </header>

      {/* Gallery */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {refs.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/60 text-lg">No refs to review</p>
            <p className="text-white/40 text-sm mt-2">Add refs by scraping a Pinterest board</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {refs.map((ref) => {
              const isSelected = selected.has(ref.filename);
              return (
                <div
                  key={ref.filename}
                  className={`
                    relative aspect-square rounded-lg overflow-hidden cursor-pointer
                    transition-all duration-150
                    ${isSelected
                      ? "ring-2 ring-emerald-500 scale-[0.98]"
                      : "ring-1 ring-white/10 hover:ring-white/30"
                    }
                  `}
                  onClick={() => toggleSelect(ref.filename)}
                >
                  <img
                    src={ref.url}
                    alt={ref.filename}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${ref.filename}/300/300`;
                    }}
                  />

                  {/* Checkbox overlay */}
                  <div className={`
                    absolute top-2 left-2 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all
                    ${isSelected
                      ? "bg-emerald-500 border-emerald-500"
                      : "bg-black/30 border-white/50"
                    }
                  `}>
                    {isSelected && (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>

                  {/* Reject button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReject(ref.filename);
                    }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 hover:bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
