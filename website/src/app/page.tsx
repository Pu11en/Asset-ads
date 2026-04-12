import AdsClient from "@/components/ads-client";

async function getPosts() {
  try {
    const res = await fetch(`${process.env.baseUrl || ''}/data/posts.json`, { cache: 'no-store' });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function getAds() {
  try {
    const res = await fetch(`${process.env.baseUrl || ''}/data/ads.json`, { cache: 'no-store' });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function Home() {
  const [posts, ads] = await Promise.all([getPosts(), getAds()]);
  return <AdsClient posts={posts} ads={ads} />;
}
