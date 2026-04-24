'use client';

import { useState } from 'react';
import Image from 'next/image';

type Ad = {
  id: string;
  filename: string;
  path: string;
  product_name?: string;
  caption?: string;
  created_at?: string;
};

type Props = {
  ads: Ad[];
  brand: string;
  brandColor: string;
  scheduledCount?: number;
};

export function AdGrid({ ads, brand, brandColor, scheduledCount }: Props) {
  const [selectedAd, setSelectedAd] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Ad Pool
        </h2>
        <span className="text-xs text-white/30">{ads.length} unused{scheduledCount !== undefined ? ` · ${scheduledCount} scheduled` : ''}</span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {ads.map(ad => (
          <button
            key={ad.id}
            onClick={() => setSelectedAd(ad.id === selectedAd ? null : ad.id)}
            className={`group rounded-lg border overflow-hidden text-left transition ${
              ad.id === selectedAd
                ? 'border-white/40 ring-1 ring-white/20'
                : 'border-white/10 hover:border-white/20'
            }`}
          >
            <div className="aspect-square bg-black/40 relative">
              <Image
                src={ad.path}
                alt={ad.product_name ?? ad.id}
                fill
                sizes="120px"
                className="object-cover"
              />
            </div>
            <div className="p-1.5">
              <p className="text-xs truncate text-white/60 font-medium">
                {ad.product_name ?? ad.filename}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Ad detail modal */}
      {selectedAd && (
        <AdDetail
          ad={ads.find(a => a.id === selectedAd)!}
          brand={brand}
          brandColor={brandColor}
          onClose={() => setSelectedAd(null)}
        />
      )}
    </div>
  );
}

function AdDetail({
  ad,
  brand,
  brandColor,
  onClose,
}: {
  ad: Ad;
  brand: string;
  brandColor: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111] overflow-hidden">
        <div className="relative aspect-[4/5] bg-black">
          <Image
            src={ad.path}
            alt={ad.product_name ?? ad.id}
            fill
            sizes="480px"
            className="object-contain"
          />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
          >
            ×
          </button>
        </div>
        <div className="p-4">
          <h3 className="text-base font-semibold">{ad.product_name ?? ad.id}</h3>
          {ad.caption && (
            <p className="text-sm text-white/50 mt-1">{ad.caption}</p>
          )}
          <p className="text-xs text-white/30 mt-1 font-mono">{ad.filename}</p>
          <a
            href={ad.path}
            download
            className="mt-3 flex items-center justify-center w-full rounded-lg py-2 text-sm font-medium border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition"
          >
            Download
          </a>
        </div>
      </div>
    </div>
  );
}
