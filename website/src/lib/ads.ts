import { readFile } from 'fs/promises';
import path from 'path';

export type Ad = {
  id: string;
  filename: string;
  path: string;
  product_name?: string;
  caption?: string;
  status?: string;
  brand?: string;
  created_at?: string;
};

export async function getAdsForBrand(brandSlug: string): Promise<Ad[]> {
  const filePath = path.join(process.cwd(), 'public', 'data', `${brandSlug}.json`);
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as Ad[];
  } catch {
    return [];
  }
}
