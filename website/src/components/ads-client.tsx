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

const BRAND_COLORS = {
  orange: "#FF6B35",
  teal: "#00B4D8",
  green: "#90BE6D",
};

export default function AdsClient({ posts: initialPosts, ads: initialAds }: AdsClientProps) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [ads, setAds] = useState<Ad[]>(initialAds);
  const [selectedPostIdx, setSelectedPostIdx] = useState<number | null>(null);
  const [selectedAdIdx, setSelectedAdIdx] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>("ads");

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

  // Helper: get ad object by id
  const getAd = (adId: string): Ad | undefined => ads.find((a) => a.id === adId);

  // Build carousel grid for selected post
  const selectedPost = selectedPostIdx !== null ? posts[selectedPostIdx] : null;
  const carouselAds = selectedPost
    ? selectedPost.ads.map((id) => getAd(id)).filter(Boolean) as Ad[]
    : [];

  // Instagram preview — first carousel image or blank
  const previewImage = carouselAds[0]?.path || "";

  return (
    <div className="min-h-screen bg-background">
      <Toaster />

      {/* Header */}
      <header
        className="border-b px-6 py-4"
        style={{ borderColor: `${BRAND_COLORS.orange}20`, background: "hsl(0 0 6%)" }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: BRAND_COLORS.orange }}>
              Island Splash
            </h1>
            <p className="text-sm text-muted-foreground">Asset Ads — Generated Content</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="text-xs"
              style={{ borderColor: `${BRAND_COLORS.teal}60`, color: BRAND_COLORS.teal }}
            >
              {ads.length} ads
            </Badge>
            <Badge
              variant="outline"
              className="text-xs"
              style={{ borderColor: `${BRAND_COLORS.green}60`, color: BRAND_COLORS.green }}
            >
              {posts.filter((p) => p.status === "approved" || p.status === "ready").length} posts
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="ads">All Ads</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          {/* ALL ADS TAB */}
          <TabsContent value="ads" className="mt-6">
            {ads.length === 0 ? (
              <Card>
                <CardContent className="py-20 text-center text-muted-foreground">
                  No ads yet. Send a reference image on Telegram to generate ads.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {ads.map((ad) => (
                  <Card
                    key={ad.id}
                    className="overflow-hidden cursor-pointer hover:border-primary transition-colors"
                    onClick={() => {
                      setSelectedAdIdx(ads.findIndex((a) => a.id === ad.id));
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
          </TabsContent>

          {/* POSTS TAB */}
          <TabsContent value="posts" className="mt-6">
            {posts.length === 0 ? (
              <Card>
                <CardContent className="py-20 text-center text-muted-foreground">
                  No posts yet. Say &ldquo;make Instagram posts&rdquo; on Telegram to create some.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {posts.map((post, idx) => (
                  <Card key={post.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Post {idx + 1}</CardTitle>
                        <StatusBadge status={post.status} />
                      </div>
                      {post.created_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(post.created_at).toLocaleString()}
                        </p>
                      )}
                    </CardHeader>
                    <CardContent>
                      {/* Carousel thumbnails */}
                      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                        {post.ads.map((adId, cIdx) => {
                          const ad = getAd(adId);
                          return ad?.path ? (
                            <div
                              key={adId}
                              className="w-24 h-30 flex-shrink-0 rounded-lg overflow-hidden border-2 border-transparent hover:border-primary cursor-pointer transition-colors"
                              onClick={() => {
                                setSelectedPostIdx(idx);
                                setSelectedAdIdx(cIdx);
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
                      <p className="text-sm mt-2" style={{ color: BRAND_COLORS.teal }}>
                        {post.hashtags}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* PREVIEW TAB */}
          <TabsContent value="preview" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Left: carousel or ad */}
              <div className="lg:col-span-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {selectedPost ? `Post ${selectedPostIdx! + 1} — Slide ${selectedAdIdx !== null ? selectedAdIdx + 1 : 1}` : "Ad Preview"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedPost ? (
                      <CarouselViewer
                        ads={carouselAds}
                        selectedIdx={selectedAdIdx ?? 0}
                        onSelectIdx={setSelectedAdIdx}
                      />
                    ) : selectedAdIdx !== null && ads[selectedAdIdx] ? (
                      <div className="aspect-[4/5] rounded-xl overflow-hidden bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={ads[selectedAdIdx].path}
                          alt={ads[selectedAdIdx].product_name || ads[selectedAdIdx].id}
                          className="object-contain w-full h-full"
                        />
                      </div>
                    ) : (
                      <div className="aspect-[4/5] rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
                        Click an ad or post to preview
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
                        <p className="text-sm" style={{ color: BRAND_COLORS.teal }}>
                          {selectedPost.hashtags}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Hashtags</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {(selectedPost.hashtags || "").split(/\s+/).filter(Boolean).map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="text-xs"
                              style={{
                                borderColor: `${BRAND_COLORS.green}60`,
                                color: BRAND_COLORS.green,
                              }}
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
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
                        />
                      </CardContent>
                    </Card>
                  </>
                ) : selectedAdIdx !== null && ads[selectedAdIdx] ? (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Ad Details</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">ID</span>
                          <span className="font-mono text-xs">{ads[selectedAdIdx].id}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Product</span>
                          <span>{ads[selectedAdIdx].product_name || "—"}</span>
                        </div>
                        {ads[selectedAdIdx].caption && (
                          <p className="text-sm mt-2">{ads[selectedAdIdx].caption}</p>
                        )}
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground text-sm">
                      Select an ad or post to see details
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    draft: { label: "Draft", color: "#aaa", bg: "hsl(0 0 20%)" },
    approved: { label: "Approved", color: BRAND_COLORS.green, bg: `${BRAND_COLORS.green}20` },
    ready: { label: "Ready", color: BRAND_COLORS.teal, bg: `${BRAND_COLORS.teal}20` },
    posted: { label: "Posted", color: BRAND_COLORS.orange, bg: `${BRAND_COLORS.orange}20` },
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
}: {
  image: string;
  caption: string;
  hashtags: string;
}) {
  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: "hsl(0 0 15%)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2" style={{ background: "hsl(0 0 8%)" }}>
        <div
          className="w-8 h-8 rounded-full"
          style={{ background: `linear-gradient(135deg, ${BRAND_COLORS.orange}, ${BRAND_COLORS.teal})` }}
        />
        <span className="text-sm font-bold" style={{ color: BRAND_COLORS.orange }}>
          islandsplashjuice
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
      <div className="px-3 py-2 flex gap-4 text-lg" style={{ color: BRAND_COLORS.orange }}>
        <span>♡</span>
        <span>💬</span>
        <span>✈️</span>
      </div>
      {/* Caption */}
      <div className="px-3 pb-3">
        <p className="text-sm">
          <span className="font-bold mr-2" style={{ color: BRAND_COLORS.orange }}>
            islandsplashjuice
          </span>
          {caption}
        </p>
        <p className="text-sm mt-1" style={{ color: BRAND_COLORS.teal }}>
          {hashtags}
        </p>
      </div>
    </div>
  );
}
