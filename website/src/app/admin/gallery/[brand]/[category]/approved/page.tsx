"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function ApprovedGalleryPage() {
  const params = useParams();
  const router = useRouter();
  const brand = params.brand as string;
  const category = params.category as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/gallery/${brand}/${category}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
      });
  }, [brand, category]);

  if (loading) return <div className="p-8 text-white">Loading...</div>;

  const approvedFiles = data?.refs?.approved_files || [];
  const approvedCount = data?.refs?.approved || 0;

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
                <h1 className="text-lg font-semibold capitalize">Approved References</h1>
                <p className="text-sm text-white/60">{brand} — {category}</p>
              </div>
            </div>
            <button
              onClick={() => router.push(`/admin/generate/${brand}/${category}`)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition"
            >
              Generate Ads →
            </button>
          </div>
        </div>
      </header>

      {/* Gallery */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {approvedCount === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/60 text-lg">No approved refs yet</p>
            <button
              onClick={() => router.push(`/admin/gallery/${brand}/${category}`)}
              className="mt-4 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition"
            >
              ← Go to Gallery to approve
            </button>
          </div>
        ) : (
          <>
            <p className="text-white/60 mb-6">{approvedCount} approved references ready for ad generation</p>
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {approvedFiles.map((ref: any) => (
                <div key={ref.filename} className="relative aspect-square rounded-lg overflow-hidden bg-white/5">
                  <img
                    src={ref.url}
                    alt={ref.filename}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${ref.filename}/300/300`;
                    }}
                  />
                  <div className="absolute top-2 left-2 w-6 h-6 rounded-md bg-emerald-500 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
