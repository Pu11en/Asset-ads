"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";

type Ref = {
  filename: string;
  path: string;
  url: string;
};

type Board = {
  id: string;
  url: string;
  pool: string;
  status: string;
  imageCount: number;
  addedAt: string;
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

export default function GalleryPage() {
  const params = useParams();
  const router = useRouter();
  const brand = params.brand as string;
  const category = params.category as string;

  const [data, setData] = useState<PoolData | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showAddBoard, setShowAddBoard] = useState(false);
  const [boardUrl, setBoardUrl] = useState("");
  const [addingBoard, setAddingBoard] = useState(false);

  const fetchRefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gallery/${brand}/${category}`);
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

  const fetchBoards = useCallback(async () => {
    try {
      const res = await fetch(`/api/boards/${brand}`);
      if (res.ok) {
        const json = await res.json();
        setBoards(json.boards || []);
      }
    } catch (err) {
      console.error("Failed to fetch boards:", err);
    }
  }, [brand]);

  useEffect(() => {
    fetchRefs();
    fetchBoards();
  }, [fetchRefs, fetchBoards]);

  const handleAddBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boardUrl.trim()) return;

    setAddingBoard(true);
    try {
      const res = await fetch(`/api/boards/${brand}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: boardUrl.trim(), pool: category }),
      });
      if (res.ok) {
        setBoardUrl("");
        setShowAddBoard(false);
        fetchBoards();
        // Refresh refs after a moment (scraping happens in background)
        setTimeout(fetchRefs, 2000);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to add board");
      }
    } catch (err) {
      console.error("Failed to add board:", err);
      alert("Failed to add board");
    } finally {
      setAddingBoard(false);
    }
  };

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
      const res = await fetch(`/api/gallery/${brand}/${category}/approve`, {
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

  const [generating, setGenerating] = useState(false);

  const handleGenerateAds = async () => {
    if (state.approved < 3) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'generate_ads', brand }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Generate ads job added to queue. Hermes will process it shortly.');
      } else {
        alert(data.error || 'Failed to add job to queue');
      }
    } catch (err) {
      console.error('Failed to add job:', err);
      alert('Failed to add job to queue');
    } finally {
      setGenerating(false);
    }
  };


  const handleReject = async (filename?: string) => {
    const toReject = filename ? [filename] : Array.from(selected);
    if (toReject.length === 0) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/gallery/${brand}/${category}/reject`, {
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
          <p className="text-white/60">Loading...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-white/60">Failed to load</p>
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

            {/* Add Board Button */}
            <button
              onClick={() => setShowAddBoard(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Board
            </button>
          </div>


          {/* Progress + Navigation */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-6 text-sm">
              <span className="text-emerald-400">{state.approved} approved</span>
              <span className="text-red-400">{state.rejected} rejected</span>
              <span className="text-white/60">{refs.length} remaining</span>
            </div>
            <div className="flex items-center gap-3">
              {state.approved >= 3 && (
                <button
                  onClick={handleGenerateAds}
                  disabled={generating}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg text-sm font-medium transition flex items-center gap-2"
                >
                  {generating ? '◌ Adding to queue...' : '🎨 Generate Ads'}
                </button>
              )}
              {state.approved > 0 && (
                <button
                  onClick={() => router.push(`/admin/gallery/${brand}/${category}/approved`)}
                  className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 rounded-lg text-sm font-medium transition text-emerald-400"
                >
                  ✓ View {state.approved} Approved →
                </button>
              )}
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
              Deselect
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
              {actionLoading ? "..." : `Approve (${selected.size})`}
            </button>
            <button
              onClick={() => handleReject()}
              disabled={selected.size === 0 || actionLoading}
              className="px-6 py-2 bg-red-600/50 hover:bg-red-600 disabled:bg-red-600/30 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition"
            >
              {actionLoading ? "..." : `Reject (${selected.size})`}
            </button>
          </div>
        </div>
      </header>

      {/* Boards List */}
      {boards.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 py-4 border-b border-white/10">
          <h2 className="text-xs uppercase tracking-widest text-white/40 mb-3">Pinterest Boards</h2>
          <div className="flex flex-wrap gap-2">
            {boards.map(board => (
              <div key={board.url} className="px-3 py-2 bg-white/5 rounded-lg border border-white/10 flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${board.status === 'pending' ? 'bg-yellow-400' : 'bg-emerald-400'}`} />
                <span className="text-sm text-white/70 truncate max-w-xs">{board.url}</span>
                <span className="text-xs text-white/40">{board.imageCount} images</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gallery */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {refs.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/60 text-lg">No refs to review</p>
            <p className="text-white/40 text-sm mt-2">Add a Pinterest board above to get started</p>
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

                  {/* Checkbox */}
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

                  {/* X button */}
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

      {/* Add Board Modal */}
      {showAddBoard && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Add Pinterest Board</h2>
              <button
                onClick={() => setShowAddBoard(false)}
                className="text-white/60 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddBoard}>
              <label className="block text-sm text-white/60 mb-2">Board URL</label>
              <input
                type="url"
                value={boardUrl}
                onChange={(e) => setBoardUrl(e.target.value)}
                placeholder="https://www.pinterest.com/..."
                className="w-full px-4 py-3 bg-black/40 border border-white/20 rounded-lg text-white placeholder-white/40 outline-none focus:border-white/40"
                required
              />

              <p className="text-xs text-white/40 mt-3 mb-6">
                Paste a Pinterest board URL. Images will be scraped automatically.
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddBoard(false)}
                  className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingBoard || !boardUrl.trim()}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition"
                >
                  {addingBoard ? "Adding..." : "Add Board"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
