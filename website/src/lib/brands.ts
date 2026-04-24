export type Brand = {
  slug: string;
  name: string;
  accent: string; // tailwind gradient / accent color hint
};

export const BRANDS: Record<string, Brand> = {
  "island-splash": {
    slug: "island-splash",
    name: "Island Splash",
    accent: "from-orange-500 to-pink-500",
  },
  "cinco-h-ranch": {
    slug: "cinco-h-ranch",
    name: "Cinco H Ranch",
    accent: "from-amber-700 to-stone-700",
  },
};

export function listBrands(): Brand[] {
  return Object.values(BRANDS);
}

export function getBrand(slug: string): Brand | null {
  return BRANDS[slug] ?? null;
}
