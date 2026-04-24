"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

interface Ad {
  id: string;
  filename: string;
  path: string;
  product_name?: string;
  caption?: string;
  hashtags?: string;
  status?: string;
  created_at?: string;
  carousel_id?: string;
  position?: number;
  brand?: string;
}

interface Post {
  id: string;
  caption: string;
  hashtags: string;
  status: string;
  ads: string[];
  created_at?: string;
}

interface AdsClientProps {
  posts: Post[];
  ads: Ad[];
}

const BRAND_COLORS: Record<string, { orange: string; teal: string; green: string; name: string }> = {
  "island-splash": {
    name: "Island Splash",
    orange: "#FF6B35",
    teal: "#00B4D8",
    green: "#90BE6D",
  },
  "cinco-h-ranch": {
    name: "Cinco H Ranch Naturals",
    orange: "#204050",
    teal: "#B03030",
    green: "#F0E0B0",
  },
};

const BRANDS = Object.keys(BRAND_COLORS);

export default function AdsClient({ posts: initialPosts, ads: initialAds }: AdsClientProps) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [ads, setAds] = useState<Ad[]>(initialAds);
  const [activeBrand, setActiveBrand] = useState<string>("island-splash");
  const [selectedPostIdx, setSelectedPostIdx] = useState<number | null>(null);
  const [selectedAdIdx, setSelectedAdIdx] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>("ads");

  const colors = BRAND_COLORS[activeBrand];

  // Reload data periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [postsRes, adsRes] = await Promise.all([
          fetch("/data/posts.json"),
          fetch("/data/ads.json"),
        ]);
        if (postsRes.ok) setPosts(await postsRes.json());
        if (adsRes.ok) setAds(await adsRes.json());
      } catch {
        // silently fail on reload
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const getAd = (adId: string): Ad | undefined => ads.find((a) => a.id === adId);

  const brandAds = ads.filter((a) => a.brand === activeBrand);
  const brandPosts = posts; // posts are per-brand in real impl; for now show all

  const selectedPost = selectedPostIdx !== null ? brandPosts[selectedPostIdx] : null;
  const carouselAds = selectedPost
    ? selectedPost.ads.map((id) => getAd(id)).filter(Boolean) as Ad[]
    : [];

  return (
    <div className="min-h-screen bg-background">
      <Toaster />

      {/* Header */}
      <header
        className="border-b px-6 py-4"
        style={{ borderColor: `${colors.orange}20`, background: "hsl(0 0 6%)" }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: colors.orange }}>
              {colors.name}
            </h1>
            <p className="text-sm text-muted-foreground">Asset Ads — Generated Content</p>
          </div>
          {/* Brand switcher */}
          <div className="flex items-center gap-2">
            {BRANDS.map((brand) => (
              <button
                key={brand}
                onClick={() => { setActiveBrand(brand); setSelectedAdIdx(null); setSelectedPostIdx(null); setActiveTab("ads"); }}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
                style={{
                  background: activeBrand === brand ? colors.orange : "transparent",
                  color: activeBrand === brand ? "white" : colors.orange,
                  borderColor: colors.orange,
                }}
              >
                {BRAND_COLORS[brand].name}
              </button>
            ))}
          </div>
          {/* Counts */}
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="text-xs"
              style={{ borderColor: `${colors.teal}60`, color: colors.teal }}
            >
              {brandAds.length} assets
            </Badge>
            {activeBrand === "island-splash" && (
              <Badge
                variant="outline"
                className="text-xs"
                style={{ borderColor: `${colors.green}60`, color: colors.green }}
              >
                {brandPosts.filter((p) => p.status === "approved" || p.status === "ready").length} posts
              </Badge>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="ads">Assets</TabsTrigger>
            {activeBrand === "island-splash" && <TabsTrigger value="posts">Posts</TabsTrigger>}
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          {/* ASSETS TAB */}
          <TabsContent value="ads" className="mt-6">
            {/* Ad grid */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-4" style={{ color: colors.orange }}>
                Generated Ads
              </h2>
              {brandAds.filter((a) => a.status !== "product").length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground text-sm">
                    No ads generated yet for {BRAND_COLORS[activeBrand].name}.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {brandAds
                    .filter((a) => a.status !== "product")
                    .map((ad) => (
                      <Card
                        key={ad.id}
                        className="overflow-hidden cursor-pointer hover:border-primary transition-colors"
                        onClick={() => {
                          setSelectedAdIdx(brandAds.indexOf(brandAds.find((a2) => a2.id === ad.id)!));
                          setActiveTab("preview");
                        }}
                      >
                        <div className="aspect-[4/5] relative bg-muted">
                          {ad.path ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={ad.path}
                              alt={ad.product_name || ad.id}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                              No image
                            </div>
                          )}
                        </div>
                        <CardContent className="p-3">
                          <p className="text-sm font-medium truncate">
                            {ad.product_name || ad.id.slice(0, 12)}
                          </p>
                          {ad.caption && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {ad.caption}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                </div>
              )}
            </div>

            {/* Products */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-4" style={{ color: colors.orange }}>
                Products
              </h2>
              {brandAds.filter((a) => a.status === "product").length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground text-sm">
                    No products loaded.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {brandAds
                    .filter((a) => a.status === "product")
                    .map((ad) => (
                      <Card key={ad.id}>
                        <CardContent className="p-0">
                          <div className="aspect-square bg-muted relative">
                            {ad.path ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={ad.path}
                                alt={ad.product_name || ad.id}
                                className="object-contain w-full h-full"
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                                No image
                              </div>
                            )}
                          </div>
                          <div className="p-3">
                            <p className="text-sm font-medium">{ad.product_name || ad.id}</p>
                            <Badge
                              variant="outline"
                              className="mt-1 text-xs"
                              style={{ borderColor: `${colors.teal}60`, color: colors.teal }}
                            >
                              Product
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              )}
            </div>

            {/* References */}
            {activeBrand === "cinco-h-ranch" && (
              <div>
                <h2 className="text-lg font-semibold mb-4" style={{ color: colors.orange }}>
                  Reference Pools
                </h2>
                <RefPoolSection brand={activeBrand} colors={colors} />
              </div>
            )}
          </TabsContent>

          {/* POSTS TAB (Island Splash only) */}
          {activeBrand === "island-splash" && (
            <TabsContent value="posts" className="mt-6">
              {brandPosts.length === 0 ? (
                <Card>
                  <CardContent className="py-20 text-center text-muted-foreground text-sm">
                    No posts yet. Say &ldquo;make Instagram posts&rdquo; on Telegram to create some.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {brandPosts.map((post, idx) => (
                    <Card key={post.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">Post {idx + 1}</CardTitle>
                          <StatusBadge status={post.status} colors={colors} />
                        </div>
                        {post.created_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(post.created_at).toLocaleString()}
                          </p>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                          {post.ads.map((adId) => {
                            const ad = getAd(adId);
                            return ad?.path ? (
                              <div
                                key={adId}
                                className="w-24 h-30 flex-shrink-0 rounded-lg overflow-hidden border-2 border-transparent hover:border-primary cursor-pointer transition-colors"
                                onClick={() => {
                                  setSelectedPostIdx(idx);
                                  setActiveTab("preview");
                                }}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={ad.path}
                                  alt={ad.product_name || adId}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div
                                key={adId}
                                className="w-24 h-30 flex-shrink-0 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground border-2 border-transparent"
                              >
                                {adId.slice(0, 6)}
                              </div>
                            );
                          })}
                        </div>
                        <Separator className="mb-4" />
                        <p className="text-sm leading-relaxed">{post.caption}</p>
                        <p className="text-sm mt-2" style={{ color: colors.teal }}>
                          {post.hashtags}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          )}

          {/* PREVIEW TAB */}
          <TabsContent value="preview" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Left: carousel or ad */}
              <div className="lg:col-span-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {selectedPost
                        ? `Post ${selectedPostIdx! + 1} — Slide ${selectedAdIdx !== null ? selectedAdIdx + 1 : 1}`
                        : "Ad Preview"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedPost ? (
                      <CarouselViewer
                        ads={carouselAds}
                        selectedIdx={selectedAdIdx ?? 0}
                        onSelectIdx={setSelectedAdIdx}
                      />
                    ) : selectedAdIdx !== null && brandAds[selectedAdIdx] ? (
                      <div className="aspect-[4/5] rounded-xl overflow-hidden bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={brandAds[selectedAdIdx].path}
                          alt={brandAds[selectedAdIdx].product_name || brandAds[selectedAdIdx].id}
                          className="object-contain w-full h-full"
                        />
                      </div>
                    ) : (
                      <div
                        className="aspect-[4/5] rounded-xl bg-muted flex items-center justify-center text-muted-foreground"
                      >
                        Click an asset to preview
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right: caption + meta */}
              <div className="lg:col-span-2 space-y-4">
                {selectedPost ? (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Caption</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {selectedPost.caption || "No caption yet"}
                        </p>
                        <Separator className="my-3" />
                        <p className="text-sm" style={{ color: colors.teal }}>
                          {selectedPost.hashtags}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Instagram Preview</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <InstagramPreview
                          image={carouselAds[selectedAdIdx ?? 0]?.path || ""}
                          caption={selectedPost.caption || ""}
                          hashtags={selectedPost.hashtags || ""}
                          brand={activeBrand}
                        />
                      </CardContent>
                    </Card>
                  </>
                ) : selectedAdIdx !== null && brandAds[selectedAdIdx] ? (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Ad Details</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">ID</span>
                          <span className="font-mono text-xs">{brandAds[selectedAdIdx].id}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Product</span>
                          <span>{brandAds[selectedAdIdx].product_name || "—"}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Type</span>
                          <Badge
                            variant="outline"
                            className="text-xs"
                            style={{
                              borderColor: `${colors.teal}60`,
                              color: colors.teal,
                            }}
                          >
                            {brandAds[selectedAdIdx].status === "product" ? "Product" : "Generated Ad"}
                          </Badge>
                        </div>
                        {brandAds[selectedAdIdx].caption && (
                          <p className="text-sm mt-2">{brandAds[selectedAdIdx].caption}</p>
                        )}
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground text-sm">
                      Select an asset to see details
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatusBadge({ status, colors }: { status: string; colors: { orange: string; teal: string; green: string } }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    draft: { label: "Draft", color: "#aaa", bg: "hsl(0 0 20%)" },
    approved: { label: "Approved", color: colors.green, bg: `${colors.green}20` },
    ready: { label: "Ready", color: colors.teal, bg: `${colors.teal}20` },
    posted: { label: "Posted", color: colors.orange, bg: `${colors.orange}20` },
    rejected: { label: "Rejected", color: "#f55", bg: "hsl(0 100% 20%)" },
  };
  const s = map[status] || map.draft;
  return (
    <Badge className="text-xs font-semibold uppercase" style={{ color: s.color, background: s.bg }}>
      {s.label}
    </Badge>
  );
}

function CarouselViewer({
  ads,
  selectedIdx,
  onSelectIdx,
}: {
  ads: Ad[];
  selectedIdx: number;
  onSelectIdx: (i: number) => void;
}) {
  if (ads.length === 0) {
    return (
      <div className="aspect-square rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
        No images in carousel
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="aspect-[4/5] rounded-xl overflow-hidden bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ads[selectedIdx].path}
          alt={ads[selectedIdx].product_name || ads[selectedIdx].id}
          className="object-contain w-full h-full"
        />
      </div>
      {ads.length > 1 && (
        <ScrollArea className="w-full">
          <div className="flex gap-2 p-1">
            {ads.map((ad, i) => (
              <div
                key={ad.id}
                className={`w-16 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 cursor-pointer transition-colors ${
                  i === selectedIdx ? "border-primary" : "border-transparent hover:border-muted-foreground"
                }`}
                onClick={() => onSelectIdx(i)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ad.path} alt={ad.product_name || ad.id} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
      <p className="text-center text-xs text-muted-foreground">
        Slide {selectedIdx + 1} of {ads.length}
      </p>
    </div>
  );
}

function InstagramPreview({
  image,
  caption,
  hashtags,
  brand,
}: {
  image: string;
  caption: string;
  hashtags: string;
  brand: string;
}) {
  const colors = BRAND_COLORS[brand];
  const handle = brand === "island-splash" ? "islandsplashjuice" : "cincohranchnaturals";
  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: "hsl(0 0 15%)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2" style={{ background: "hsl(0 0 8%)" }}>
        <div
          className="w-8 h-8 rounded-full"
          style={{ background: `linear-gradient(135deg, ${colors.orange}, ${colors.teal})` }}
        />
        <span className="text-sm font-bold" style={{ color: colors.orange }}>
          {handle}
        </span>
      </div>
      {/* Image */}
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="Post" className="w-full aspect-square object-cover" />
      ) : (
        <div className="w-full aspect-square bg-muted flex items-center justify-center text-muted-foreground text-xs">
          No image
        </div>
      )}
      {/* Actions */}
      <div className="px-3 py-2 flex gap-4 text-lg" style={{ color: colors.orange }}>
        <span>♡</span>
        <span>💬</span>
        <span>✈️</span>
      </div>
      {/* Caption */}
      <div className="px-3 pb-3">
        <p className="text-sm">
          <span className="font-bold mr-2" style={{ color: colors.orange }}>
            {handle}
          </span>
          {caption}
        </p>
        <p className="text-sm mt-1" style={{ color: colors.teal }}>
          {hashtags}
        </p>
      </div>
    </div>
  );
}

function RefPoolSection({
  brand,
  colors,
}: {
  brand: string;
  colors: { orange: string; teal: string; green: string };
}) {
  const [expandedPool, setExpandedPool] = useState<string | null>(null);
  const pools = ["soap", "cream", "sunscreen"];
  const poolLabels: Record<string, string> = {
    soap: "Honey Vanilla Soap",
    cream: "Rejuvenating Face + Body Cream",
    sunscreen: "Sunscreen Stick",
  };
  const poolPaths: Record<string, string[]> = {
    soap: ["soap_ref.jpg"],
    cream: ["cream_ref.jpg"],
    sunscreen: ["sunscreen_ref2.jpg", "sunscreen_ref1.jpg", "sunscreen_ref3.png"],
  };

  return (
    <div className="space-y-3">
      {pools.map((pool) => {
        const refs = poolPaths[pool] || [];
        const isOpen = expandedPool === pool;
        return (
          <Card key={pool}>
            <CardHeader
              className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setExpandedPool(isOpen ? null : pool)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  {poolLabels[pool]}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-xs"
                    style={{ borderColor: `${colors.green}60`, color: colors.green }}
                  >
                    {refs.length} ref{refs.length !== 1 ? "s" : ""}
                  </Badge>
                  <span className="text-muted-foreground text-sm">{isOpen ? "▴" : "▾"}</span>
                </div>
              </div>
            </CardHeader>
            {isOpen && (
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {refs.map((ref) => {
                    const path = `/images/refs/${brand}/${pool}/${ref}`;
                    return (
                      <div key={ref} className="rounded-lg overflow-hidden border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={path}
                          alt={ref}
                          className="w-full aspect-[4/5] object-cover"
                          onError={(e) => {
                            // Fallback: try loading from original location
                            (e.target as HTMLImageElement).src = `/images/${ref}`;
                          }}
                        />
                        <p className="text-xs text-muted-foreground p-2 truncate">{ref}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
