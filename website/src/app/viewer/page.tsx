import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const VIEWER_PASSWORD = process.env.VIEWER_PASSWORD || 'islandsplash';

const BRANDS = [
  { slug: 'island-splash', name: 'Island Splash', color: '#FF6B35' },
  { slug: 'cinco-h-ranch', name: 'Cinco H Ranch', color: '#B03030' },
];

type Post = {
  post_id: string;
  ad_filenames: string[];
  caption?: string;
  hashtags?: string;
  post_type: string;
  scheduled?: boolean;
  scheduledTime?: string;
  publicUrl?: string;
  blotatoStatus?: string;
};

type ScheduledData = {
  posts: Post[];
  updated_at?: string;
};

export default async function ViewerPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; error?: string }>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const viewerAuth = cookieStore.get('viewer_auth')?.value;

  // Password check
  if (!viewerAuth) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-black">
        <form
          action="/api/viewer-login"
          method="post"
          className="w-full max-w-sm flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-8"
        >
          <h1 className="text-2xl font-semibold tracking-tight text-white">Asset Ads</h1>
          <p className="text-sm text-white/60">Enter password to view posts.</p>
          <input
            type="password"
            name="password"
            placeholder="Password"
            required
            autoFocus
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          />
          {params?.error === '1' && (
            <p className="text-sm text-red-400">Incorrect password.</p>
          )}
          <button
            type="submit"
            className="w-full rounded-md bg-white text-black font-medium py-2 text-sm hover:bg-white/90 transition"
          >
            Enter
          </button>
        </form>
      </main>
    );
  }

  const activeBrand = params?.brand || 'island-splash';
  const currentBrand = BRANDS.find(b => b.slug === activeBrand) || BRANDS[0];

  // Load scheduled posts from public/data/scheduled/ — works on both local and Vercel
  let posts: Post[] = [];
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/data/scheduled/${currentBrand.slug}.json`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data: ScheduledData = await res.json();
      posts = data.posts || [];
    }
  } catch {
    posts = [];
  }

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 border-b border-white/10">
        <div className="text-xs uppercase tracking-widest text-white/40">Asset Ads</div>
        <form action="/api/viewer-logout" method="post">
          <button
            type="submit"
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/50 hover:text-white hover:border-white/30 transition"
          >
            Sign out
          </button>
        </form>
      </header>

      {/* Brand tabs */}
      <div className="flex gap-0 px-6 border-b border-white/10">
        {BRANDS.map(brand => (
          <a
            key={brand.slug}
            href={`/viewer?brand=${brand.slug}`}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition ${
              brand.slug === activeBrand
                ? 'border-white text-white'
                : 'border-transparent text-white/40 hover:text-white/70'
            }`}
            style={{ borderColor: brand.slug === activeBrand ? brand.color : 'transparent' }}
          >
            {brand.name}
          </a>
        ))}
      </div>

      {/* Posts */}
      <div className="p-6">
        {posts.length === 0 ? (
          <div className="text-center py-20 text-white/40 text-sm">
            No published posts yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map(post => (
              <div
                key={post.post_id}
                className="rounded-xl border border-white/10 overflow-hidden bg-white/5"
              >
                {/* Image grid — first image large, rest small */}
                <div className="grid grid-cols-2 gap-0.5 bg-black/20">
                  {(post.ad_filenames || []).slice(0, 4).map((fn, i) => {
                    const base = fn.replace(/\.(instructions|png|jpg|webp)$/, '');
                    const imgSrc = `/images/ads/${currentBrand.slug}/${base}.png`;
                    const isLarge = i === 0;
                    return (
                      <a
                        key={i}
                        href={imgSrc}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`relative block overflow-hidden ${isLarge ? 'col-span-2 row-span-2 aspect-square' : 'aspect-square'}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imgSrc}
                          alt={`Post image ${i + 1}`}
                          className="w-full h-full object-cover hover:opacity-80 transition"
                        />
                        {i === 3 && (post.ad_filenames?.length || 0) > 4 && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xs">
                            +{(post.ad_filenames?.length || 0) - 4}
                          </div>
                        )}
                      </a>
                    );
                  })}
                </div>

                {/* Post info */}
                <div className="p-3">
                  {post.caption && (
                    <p className="text-xs text-white/70 mb-2 line-clamp-2">{post.caption}</p>
                  )}
                  {post.hashtags && (
                    <p className="text-xs text-white/30 mb-2">{post.hashtags}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {post.publicUrl && (
                        <a
                          href={post.publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-white/40 hover:text-white/70 transition flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                          </svg>
                          View on IG
                        </a>
                      )}
                    </div>
                    <a
                      href={`/images/ads/${currentBrand.slug}/${(post.ad_filenames?.[0] || '').replace(/\.(instructions|png|jpg|webp)$/, '')}.png`}
                      download
                      className="text-xs bg-white text-black px-2 py-1 rounded hover:bg-white/90 transition"
                    >
                      ↓ Download
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
