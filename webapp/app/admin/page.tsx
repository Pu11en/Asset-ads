"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase, ADMIN_UUID, BRAND_UUID } from "@/lib/supabase";
import styles from "./admin.module.css";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RefLink {
  id: string;
  url: string;
  batch_threshold: number;
  brand_id: string;
  status: string;
  notes: string | null;
  created_at: string;
}

interface CarouselItem {
  id: string;
  brand_id: string;
  thumbnail_url: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const THRESHOLDS = [
  { label: "Instant", value: 1, description: "Generates immediately, no pool" },
  { label: "5-Ref Pool", value: 5, description: "Batches at 5 references" },
  { label: "10-Ref Pool", value: 10, description: "Batches at 10 references" },
  { label: "20-Ref Pool", value: 20, description: "Batches at 20 references" },
] as const;

type Threshold = 1 | 5 | 10 | 20;

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [refs, setRefs] = useState<RefLink[]>([]);
  const [carousels, setCarousels] = useState<CarouselItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state — one per threshold path
  const [url1, setUrl1] = useState("");          // instant (1)
  const [url5, setUrl5] = useState("");          // 5-ref
  const [url10, setUrl10] = useState("");        // 10-ref
  const [url20, setUrl20] = useState("");        // 20-ref
  const [notes5, setNotes5] = useState("");
  const [notes10, setNotes10] = useState("");
  const [notes20, setNotes20] = useState("");

  // Status messages keyed by threshold
  const [msg1, setMsg1] = useState("");
  const [msg5, setMsg5] = useState("");
  const [msg10, setMsg10] = useState("");
  const [msg20, setMsg20] = useState("");

  // Generating flags
  const [gen1, setGen1] = useState(false);
  const [batching5, setBatching5] = useState(false);
  const [batching10, setBatching10] = useState(false);
  const [batching20, setBatching20] = useState(false);

  // Carousel approve/reject in-flight
  const [carouselAction, setCarouselAction] = useState<string | null>(null);

  // Caption & hashtags for carousel approval — per carousel
  const [carouselCaption, setCarouselCaption] = useState<Record<string, string>>({});
  const [carouselHashtags, setCarouselHashtags] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchRefs();
    fetchCarousels();
  }, []);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchRefs = async () => {
    const { data } = await supabase
      .from("reference_links")
      .select("id, url, batch_threshold, brand_id, status, notes, created_at")
      .order("created_at", { ascending: false });
    if (data) setRefs(data);
  };

  const fetchCarousels = async () => {
    const { data } = await supabase
      .from("carousels")
      .select("id, brand_id, thumbnail_url, status, created_at")
      .order("created_at", { ascending: false });
    if (data) setCarousels(data);
    setLoading(false);
  };

  // ── Pool counts per threshold ──────────────────────────────────────────────

  const poolCount = (threshold: number) =>
    refs.filter((r) => r.batch_threshold === threshold && r.status === "pending").length;

  const carouselPending = carousels.filter((c) => c.status === "pending").length;
  const carouselApproved = carousels.filter((c) => c.status === "approved").length;
  const carouselRejected = carousels.filter((c) => c.status === "rejected").length;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleInstant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url1) return;
    setGen1(true);
    setMsg1("Generating…");
    try {
      const res = await fetch("/api/instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url1, brand_id: BRAND_UUID }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg1(`Done! Image: ${data.image_url ?? "saved"}`);
        setUrl1("");
        await fetchCarousels();
      } else {
        setMsg1(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setMsg1(`Failed: ${err.message}`);
    } finally {
      setGen1(false);
      setTimeout(() => setMsg1(""), 6000);
    }
  };

  const handleAddRef = async (
    url: string,
    threshold: Threshold,
    notes: string,
    setMsg: (m: string) => void,
    setBatching: (b: boolean) => void
  ) => {
    if (!url) return;
    setBatching(true);
    try {
      const res = await fetch("/api/refs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, batch_threshold: threshold, brand_id: BRAND_UUID, notes }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(`Added to ${threshold}-ref pool (${poolCount(threshold) + 1} total)`);
        if (threshold === 5) { setUrl5(""); setNotes5(""); }
        if (threshold === 10) { setUrl10(""); setNotes10(""); }
        if (threshold === 20) { setUrl20(""); setNotes20(""); }
        await fetchRefs();
      } else {
        setMsg(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setMsg(`Failed: ${err.message}`);
    } finally {
      setBatching(false);
      setTimeout(() => setMsg(""), 4000);
    }
  };

  const handleDeleteRef = async (id: string) => {
    await fetch(`/api/refs/${id}`, { method: "DELETE" });
    fetchRefs();
  };

  const handleTriggerBatch = async (threshold: Threshold, setMsg: (m: string) => void) => {
    setMsg(`Triggering batch at ${threshold}…`);
    try {
      const res = await fetch("/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(`Batch triggered for ${threshold}-ref pool`);
        await fetchRefs();
      } else {
        setMsg(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setMsg(`Failed: ${err.message}`);
    }
    setTimeout(() => setMsg(""), 4000);
  };

  const handleCarouselApprove = async (id: string) => {
    setCarouselAction(id);
    try {
      const finalCaption = carouselCaption[id] || "Tropical vibes 🌴 #IslandSplash #TropicalDrink #FreshFlavor";
      const finalHashtags = carouselHashtags[id] || "#IslandSplash #TropicalDrink #FreshFlavor #HealthyDrink #NaturalIngredients";
      await fetch(`/api/carousel/${id}/caption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: finalCaption, hashtags: finalHashtags }),
      });
      await fetch(`/api/carousel/${id}/approve`, { method: "POST" });
      await fetchCarousels();
      setCarouselCaption((prev) => { const n = { ...prev }; delete n[id]; return n; });
      setCarouselHashtags((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } finally {
      setCarouselAction(null);
    }
  };

  const handleCarouselReject = async (id: string) => {
    setCarouselAction(id);
    try {
      await fetch(`/api/carousel/${id}/reject`, { method: "POST" });
      await fetchCarousels();
    } finally {
      setCarouselAction(null);
    }
  };

  if (loading) {
    return <div className={styles.loadingContainer}><p>Loading admin…</p></div>;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/" className={styles.logo}>Asset Ads</Link>
          <span className={styles.adminBadge}>Admin</span>
        </div>
        <Link href="/dashboard" className={styles.logoutButton}>Client View</Link>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>Admin Dashboard</h1>

        {/* ── Stats ─────────────────────────────────────────────────────── */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{poolCount(5)}</div>
            <div className={styles.statLabel}>Pool @ 5</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{poolCount(10)}</div>
            <div className={styles.statLabel}>Pool @ 10</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{poolCount(20)}</div>
            <div className={styles.statLabel}>Pool @ 20</div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statValue} ${styles.statPending}`}>{carouselPending}</div>
            <div className={styles.statLabel}>Carousel Pending</div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statValue} ${styles.statApproved}`}>{carouselApproved}</div>
            <div className={styles.statLabel}>Carousel Approved</div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statValue} ${styles.statRejected}`}>{carouselRejected}</div>
            <div className={styles.statLabel}>Carousel Rejected</div>
          </div>
        </div>

        {/* ── 4 Input Paths ─────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Reference Input Paths</h2>
          <p className={styles.sectionDesc}>
            All paths add to the shared pool. Instant generates and previews immediately.
          </p>

          <div className={styles.pathsGrid}>
            {/* Path 1 — Instant */}
            <div className={styles.pathCard}>
              <div className={styles.pathHeader}>
                <span className={styles.pathBadgeInstant}>Instant</span>
                <span className={styles.pathTitle}>Generate Immediately</span>
              </div>
              <p className={styles.pathDesc}>Pastes a URL and generates the ad on the spot — no pool.</p>
              <form onSubmit={handleInstant} className={styles.pathForm}>
                <input
                  type="url"
                  value={url1}
                  onChange={(e) => setUrl1(e.target.value)}
                  placeholder="https://pin.it/…"
                  className={styles.pathInput}
                  required
                />
                <button type="submit" className={styles.btnInstant} disabled={gen1}>
                  {gen1 ? "Generating…" : "Generate Now"}
                </button>
              </form>
              {msg1 && <div className={styles.pathMsg}>{msg1}</div>}
            </div>

            {/* Path 5 — 5-ref pool */}
            <div className={styles.pathCard}>
              <div className={styles.pathHeader}>
                <span className={styles.pathBadge5}>5-Ref</span>
                <span className={styles.pathTitle}>Small Pool</span>
              </div>
              <p className={styles.pathDesc}>Batch triggers automatically at 5 references in pool.</p>
              <div className={styles.pathForm}>
                <input
                  type="url"
                  value={url5}
                  onChange={(e) => setUrl5(e.target.value)}
                  placeholder="https://pin.it/…"
                  className={styles.pathInput}
                />
                <input
                  type="text"
                  value={notes5}
                  onChange={(e) => setNotes5(e.target.value)}
                  placeholder="Notes (optional)"
                  className={styles.pathInput}
                />
                <div className={styles.pathActions}>
                  <button
                    className={styles.btnPool}
                    disabled={batching5 || !url5}
                    onClick={() => handleAddRef(url5, 5, notes5, setMsg5, setBatching5)}
                  >
                    {batching5 ? "Adding…" : "Add to Pool"}
                  </button>
                  <button
                    className={styles.btnBatch}
                    disabled={poolCount(5) === 0}
                    onClick={() => handleTriggerBatch(5, setMsg5)}
                  >
                    Trigger Batch
                  </button>
                </div>
              </div>
              {msg5 && <div className={styles.pathMsg}>{msg5}</div>}
              {poolCount(5) > 0 && (
                <div className={styles.poolCount}>{poolCount(5)} / 5 in pool</div>
              )}
            </div>

            {/* Path 10 — 10-ref pool */}
            <div className={styles.pathCard}>
              <div className={styles.pathHeader}>
                <span className={styles.pathBadge10}>10-Ref</span>
                <span className={styles.pathTitle}>Medium Pool</span>
              </div>
              <p className={styles.pathDesc}>Batch triggers automatically at 10 references in pool.</p>
              <div className={styles.pathForm}>
                <input
                  type="url"
                  value={url10}
                  onChange={(e) => setUrl10(e.target.value)}
                  placeholder="https://pin.it/…"
                  className={styles.pathInput}
                />
                <input
                  type="text"
                  value={notes10}
                  onChange={(e) => setNotes10(e.target.value)}
                  placeholder="Notes (optional)"
                  className={styles.pathInput}
                />
                <div className={styles.pathActions}>
                  <button
                    className={styles.btnPool}
                    disabled={batching10 || !url10}
                    onClick={() => handleAddRef(url10, 10, notes10, setMsg10, setBatching10)}
                  >
                    {batching10 ? "Adding…" : "Add to Pool"}
                  </button>
                  <button
                    className={styles.btnBatch}
                    disabled={poolCount(10) === 0}
                    onClick={() => handleTriggerBatch(10, setMsg10)}
                  >
                    Trigger Batch
                  </button>
                </div>
              </div>
              {msg10 && <div className={styles.pathMsg}>{msg10}</div>}
              {poolCount(10) > 0 && (
                <div className={styles.poolCount}>{poolCount(10)} / 10 in pool</div>
              )}
            </div>

            {/* Path 20 — 20-ref pool */}
            <div className={styles.pathCard}>
              <div className={styles.pathHeader}>
                <span className={styles.pathBadge20}>20-Ref</span>
                <span className={styles.pathTitle}>Large Pool</span>
              </div>
              <p className={styles.pathDesc}>Batch triggers automatically at 20 references in pool.</p>
              <div className={styles.pathForm}>
                <input
                  type="url"
                  value={url20}
                  onChange={(e) => setUrl20(e.target.value)}
                  placeholder="https://pin.it/…"
                  className={styles.pathInput}
                />
                <input
                  type="text"
                  value={notes20}
                  onChange={(e) => setNotes20(e.target.value)}
                  placeholder="Notes (optional)"
                  className={styles.pathInput}
                />
                <div className={styles.pathActions}>
                  <button
                    className={styles.btnPool}
                    disabled={batching20 || !url20}
                    onClick={() => handleAddRef(url20, 20, notes20, setMsg20, setBatching20)}
                  >
                    {batching20 ? "Adding…" : "Add to Pool"}
                  </button>
                  <button
                    className={styles.btnBatch}
                    disabled={poolCount(20) === 0}
                    onClick={() => handleTriggerBatch(20, setMsg20)}
                  >
                    Trigger Batch
                  </button>
                </div>
              </div>
              {msg20 && <div className={styles.pathMsg}>{msg20}</div>}
              {poolCount(20) > 0 && (
                <div className={styles.poolCount}>{poolCount(20)} / 20 in pool</div>
              )}
            </div>
          </div>
        </section>

        {/* ── Pool Lists ─────────────────────────────────────────────────── */}
        {([5, 10, 20] as const).map((thr) => (
          refs.filter((r) => r.batch_threshold === thr && r.status === "pending").length > 0 && (
            <section key={thr} className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>{thr}-Ref Pool ({poolCount(thr)})</h2>
              </div>
              <div className={styles.refList}>
                {refs
                  .filter((r) => r.batch_threshold === thr && r.status === "pending")
                  .map((ref) => (
                    <div key={ref.id} className={styles.refItem}>
                      <div className={styles.refItemLeft}>
                        <span className={`${styles.refStatus} ${styles[`refStatus${thr}`]}`}>
                          @{thr}
                        </span>
                        <a href={ref.url} target="_blank" rel="noopener noreferrer" className={styles.refUrl}>
                          {ref.url}
                        </a>
                        {ref.notes && <span className={styles.refNotes}>{ref.notes}</span>}
                      </div>
                      <button onClick={() => handleDeleteRef(ref.id)} className={styles.refDelete}>✕</button>
                    </div>
                  ))}
              </div>
            </section>
          )
        ))}

        {/* ── Pending Carousel Approval ─────────────────────────────────── */}
        {carouselPending > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Carousel Pending Approval ({carouselPending})
            </h2>
            <div className={styles.carouselGrid}>
              {carousels
                .filter((c) => c.status === "pending")
                .map((c) => (
                  <div key={c.id} className={styles.carouselCard}>
                    {c.thumbnail_url ? (
                      <img src={c.thumbnail_url} alt="" className={styles.carouselImage} />
                    ) : (
                      <div className={styles.carouselNoImage}>No image</div>
                    )}
                    <div className={styles.carouselMeta}>
                      <span className={`${styles.badge} ${styles.badgePending}`}>Pending</span>
                      <span className={styles.carouselDate}>
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className={styles.carouselCaptionInputs}>
                      <input
                        type="text"
                        placeholder="Caption (optional)"
                        value={carouselCaption[c.id] || ""}
                        onChange={(e) => setCarouselCaption((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        className={styles.pathInput}
                      />
                      <input
                        type="text"
                        placeholder="Hashtags (optional)"
                        value={carouselHashtags[c.id] || ""}
                        onChange={(e) => setCarouselHashtags((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        className={styles.pathInput}
                      />
                    </div>
                    <div className={styles.carouselActions}>
                      <button
                        className={styles.approveBtn}
                        disabled={carouselAction === c.id}
                        onClick={() => handleCarouselApprove(c.id)}
                      >
                        {carouselAction === c.id ? "…" : "Approve"}
                      </button>
                      <button
                        className={styles.rejectBtn}
                        disabled={carouselAction === c.id}
                        onClick={() => handleCarouselReject(c.id)}
                      >
                        {carouselAction === c.id ? "…" : "Reject"}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* ── All Carousels ─────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>All Carousels</h2>
          </div>
          {carousels.length === 0 ? (
            <p className={styles.empty}>No carousels yet.</p>
          ) : (
            <div className={styles.adsTable}>
              <div className={styles.tableHeader}>
                <div>Image</div>
                <div>Status</div>
                <div>Caption</div>
                <div>Created</div>
                <div>Actions</div>
              </div>
              {carousels.map((c) => (
                <div key={c.id} className={styles.tableRow}>
                  <div>
                    {c.thumbnail_url ? (
                      <img src={c.thumbnail_url} alt="" className={styles.tableImage} />
                    ) : (
                      <span className={styles.noImage}>No image</span>
                    )}
                  </div>
                  <div>
                    <span className={`${styles.badge} ${
                      c.status === "approved" ? styles.badgeApproved :
                      c.status === "rejected" ? styles.badgeRejected :
                      styles.badgePending
                    }`}>
                      {c.status}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.85em", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(c as any).caption || "—"}
                  </div>
                  <div>{new Date(c.created_at).toLocaleDateString()}</div>
                  <div className={styles.tableActions}>
                    {c.status === "pending" && (
                      <>
                        <button
                          className={styles.approveBtn}
                          disabled={carouselAction === c.id}
                          onClick={() => handleCarouselApprove(c.id)}
                        >
                          Approve
                        </button>
                        <button
                          className={styles.rejectBtn}
                          disabled={carouselAction === c.id}
                          onClick={() => handleCarouselReject(c.id)}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
