"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

type ComposedPost = {
  brand: string;
  created_at: string;
  posts: {
    post_id: string;
    ad_filenames: string[];
    post_type: string;
    creative_concept: string;
    caption_angle: string;
    caption?: string;
    hashtags?: string;
    recommended_slots: string[];
    status?: "pending" | "approved" | "scheduled";
  }[];
  total_ads_used: number;
  total_posts: number;
  filename: string;
};

function imagePath(brand: string, filename: string): string {
  // Strip .instructions/.instructions.txt suffix -> .png
  const clean = filename.replace(/\.instructions\.txt$/, "").replace(/\.instructions$/, "");
  return `/images/ads/${brand}/${clean}.png`;
}

export default function PostsPage() {
  const [composedPosts, setComposedPosts] = useState<ComposedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<{ batch: ComposedPost; post: ComposedPost["posts"][0] } | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/posts")
      .then((res) => res.json())
      .then((data) => {
        // Sort by created_at desc, take latest batch
        const posts = (data.posts || []).sort(
          (a: ComposedPost, b: ComposedPost) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setComposedPosts(posts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleRemoveImage = async (
    batch: ComposedPost,
    post: ComposedPost["posts"][0],
    imageFilename: string
  ) => {
    const key = `${post.post_id}-${imageFilename}`;
    setRemoving(key);
    try {
      const res = await fetch("/api/posts/remove-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: batch.brand, filename: batch.filename, post_id: post.post_id, imageFilename }),
      });
      const data = await res.json();
      if (data.success) {
        setComposedPosts(prev =>
          prev.map(b => b.filename === batch.filename
            ? {
                ...b,
                posts: b.posts.map(p =>
                  p.post_id === post.post_id
                    ? { ...p, ad_filenames: p.ad_filenames.filter((f: string) => f !== imageFilename) }
                    : p
                )
              }
            : b
          )
        );
        setSelectedPost(prev => prev ? {
          ...prev,
          post: {
            ...prev.post,
            ad_filenames: prev.post.ad_filenames.filter((f: string) => f !== imageFilename)
          }
        } : null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRemoving(null);
    }
  };

  const handleApprove = async (batch: ComposedPost, post: ComposedPost["posts"][0]) => {
    setApproving(post.post_id);
    try {
      const res = await fetch("/api/posts/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: batch.brand, filename: batch.filename, post_id: post.post_id }),
      });
      const data = await res.json();
      if (data.success) {
        // Update local state
        setComposedPosts(prev =>
          prev.map(b => b.filename === batch.filename
            ? { ...b, posts: b.posts.map(p => p.post_id === post.post_id ? { ...p, status: "approved" } : p) }
            : b
          )
        );
      }
    } finally {
      setApproving(null);
      setSelectedPost(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading composed posts...
      </div>
    );
  }

  const latestBatch = composedPosts[0];

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="px-6 py-5 border-b border-white/10 sticky top-0 z-50 bg-black/90 backdrop-blur">
        <a href="/admin" className="text-sm text-white/50 hover:text-white">
          ← Back to Admin
        </a>
        <h1 className="text-2xl font-bold mt-2">Composed Posts</h1>
        <p className="text-sm text-white/50 mt-1">
          Review and approve posts before scheduling
        </p>
      </header>

      <div className="p-6 max-w-5xl mx-auto">
        {composedPosts.length === 0 ? (
          <div className="text-center py-20 text-white/50">
            No composed posts yet. Tell Hermes to compose when ready.
          </div>
        ) : (
          <div className="space-y-8">
            {/* Only show latest batch for now */}
            {latestBatch && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <span className="text-emerald-400 font-bold text-lg capitalize">{latestBatch.brand.replace("-", " ")}</span>
                    <span className="text-white/30 mx-3">•</span>
                    <span className="text-white/50">{latestBatch.total_posts} posts</span>
                  </div>
                  <span className="text-white/30 text-sm">
                    {new Date(latestBatch.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {latestBatch.posts.map((post) => (
                    <button
                      key={post.post_id}
                      onClick={() => setSelectedPost({ batch: latestBatch, post })}
                      className={`rounded-2xl border text-left overflow-hidden transition hover:border-white/30 ${
                        post.status === "approved"
                          ? "border-emerald-500/50 bg-emerald-500/5"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      {/* Preview thumbnails */}
                      <div className="flex gap-0.5 p-0.5 bg-black/40">
                        {post.ad_filenames.slice(0, 4).map((fn, i) => (
                          <div key={i} className="relative w-full aspect-square bg-black/60 overflow-hidden">
                            <Image
                              src={imagePath(latestBatch.brand, fn)}
                              alt={`Ad ${i + 1}`}
                              fill
                              sizes="150px"
                              className="object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          </div>
                        ))}
                        {post.ad_filenames.length > 4 && (
                          <div className="w-full aspect-square bg-black/60 flex items-center justify-center text-white/40 text-xs">
                            +{post.ad_filenames.length - 4}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                            post.post_type === "carousel"
                              ? "bg-blue-500/20 text-blue-300"
                              : "bg-purple-500/20 text-purple-300"
                          }`}>
                            {post.post_type === "carousel" ? "Carousel" : "Solo"}
                          </span>
                          <span className="text-xs text-white/40">{post.ad_filenames.length} images</span>
                          {post.status === "approved" && (
                            <span className="ml-auto text-xs text-emerald-400 font-medium">✓ Approved</span>
                          )}
                        </div>
                        <p className="text-sm text-white/70 line-clamp-2">{post.creative_concept}</p>
                        <p className="text-xs text-white/30 mt-2 line-clamp-1">
                          {post.caption?.slice(0, 60) || post.caption_angle?.slice(0, 60)}...
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Post detail modal */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#111] overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className={`text-sm px-3 py-1 rounded-full font-medium ${
                    selectedPost.post.post_type === "carousel"
                      ? "bg-blue-500/20 text-blue-300"
                      : "bg-purple-500/20 text-purple-300"
                  }`}>
                    {selectedPost.post.post_type === "carousel" ? "Carousel" : "Solo"}
                  </span>
                  <span className="text-white/50 text-sm">{selectedPost.post.ad_filenames.length} images</span>
                </div>
                <button
                  onClick={() => setSelectedPost(null)}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white"
                >
                  ×
                </button>
              </div>

              <p className="text-white/70 text-sm mb-4">{selectedPost.post.creative_concept}</p>

              {/* Full image carousel preview */}
              <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                {selectedPost.post.ad_filenames.map((fn, i) => (
                  <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div className="relative w-40 h-40 rounded-lg overflow-hidden bg-black/60">
                      <Image
                        src={imagePath(selectedPost.batch.brand, fn)}
                        alt={`Image ${i + 1}`}
                        fill
                        sizes="160px"
                        className="object-cover"
                      />
                      <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white/60 text-xs">{i + 1}</div>
                    </div>
                    <button
                      onClick={() => handleRemoveImage(selectedPost.batch, selectedPost.post, fn)}
                      disabled={removing === `${selectedPost.post.post_id}-${fn}`}
                      className="w-full py-1.5 rounded-lg bg-white/10 hover:bg-red-600/80 text-white/60 hover:text-white text-xs font-medium transition border border-white/10"
                    >
                      {removing === `${selectedPost.post.post_id}-${fn}` ? '…' : 'Remove'}
                    </button>
                  </div>
                ))}
              </div>

              {/* Caption */}
              <div className="bg-white/5 rounded-xl p-4 mb-4">
                <p className="text-sm text-white/80 whitespace-pre-wrap mb-2">
                  {selectedPost.post.caption || "No caption"}
                </p>
                {selectedPost.post.hashtags && (
                  <p className="text-xs text-blue-400/80 whitespace-pre-wrap">
                    {selectedPost.post.hashtags}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                {selectedPost.post.status !== "approved" ? (
                  <>
                    <button
                      disabled={approving === selectedPost.post.post_id}
                      onClick={() => handleApprove(selectedPost.batch, selectedPost.post)}
                      className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold transition"
                    >
                      {approving === selectedPost.post.post_id ? "Saving…" : "✓ Approve & Schedule"}
                    </button>
                    <button
                      onClick={() => setSelectedPost(null)}
                      className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 font-medium transition border border-white/10"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 py-3 rounded-xl bg-emerald-500/20 text-emerald-300 font-bold text-center border border-emerald-500/30">
                      ✓ Approved — Ready to Schedule
                    </div>
                    <button
                      onClick={() => setSelectedPost(null)}
                      className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 transition border border-white/10"
                    >
                      Close
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
