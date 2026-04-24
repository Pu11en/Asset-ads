#!/usr/bin/env python3
"""
Drain images from a Pinterest board and add to product pool.

Uses yt-dlp for reliable Pinterest scraping.

Usage:
  python3 skill/scripts/drain_board.py --brand island-splash --board-url "https://pin.it/XXXXX" --pool "all-drinks"
  python3 skill/scripts/drain_board.py --brand island-splash --board-url "https://pin.it/XXXXX" --pool "all-drinks" --max-images 100
"""

import argparse
import json
import os
import re
import subprocess
import sys
import shutil
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
WEBSITE_PUBLIC = REPO_ROOT / "website" / "public"
REFS_PUBLIC_DIR = WEBSITE_PUBLIC / "images" / "refs"
REFS_DATA_DIR = WEBSITE_PUBLIC / "data" / "refs"


def is_ytdlp_available() -> bool:
    """Check if yt-dlp is installed."""
    try:
        result = subprocess.run(['yt-dlp', '--version'], capture_output=True, text=True)
        return result.returncode == 0
    except:
        return False


def install_ytdlp():
    """Install yt-dlp."""
    print("📦 Installing yt-dlp...")
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'yt-dlp'], check=True)
    print("✅ yt-dlp installed")


def scrape_pinterest_board(board_url: str, max_images: int = None, output_dir: str = None) -> list:
    """
    Scrape images from a Pinterest board using yt-dlp.
    Returns list of downloaded image paths.
    """
    if not is_ytdlp_available():
        install_ytdlp()
    
    # Create temp directory for downloads
    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix='pinterest_')
    
    # Build yt-dlp command
    # Pinterest collections use the collection extractor
    cmd = [
        'yt-dlp',
        '--quiet',
        '--no-warnings',
        '--extract-flat', 'False',
        '--skip-download', 'False',
        '-o', f'{output_dir}/%(id)s.%(ext)s',
    ]
    
    # Add limit if specified
    if max_images:
        cmd.extend(['--max-filesize', '50M'])  # Skip very large files
    
    # Add the URL
    cmd.append(board_url)
    
    print(f"📥 Scraping Pinterest board...")
    print(f"   URL: {board_url}")
    print(f"   Output: {output_dir}")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if result.returncode != 0:
            print(f"⚠️  yt-dlp output: {result.stdout}")
            print(f"⚠️  yt-dlp error: {result.stderr}")
            
            # Try alternative approach for Pinterest collections
            if 'collection' in board_url.lower() or 'pin.it' in board_url:
                return scrape_pinterest_fallback(board_url, max_images, output_dir)
            
            return []
        
        print(f"✅ Download complete")
        
    except subprocess.TimeoutExpired:
        print(f"⚠️  Timed out after 5 minutes")
        return []
    except Exception as e:
        print(f"⚠️  Error: {e}")
        return []
    
    # Find downloaded images
    downloaded = []
    output_path = Path(output_dir)
    
    for ext in ['jpg', 'jpeg', 'png', 'webp']:
        downloaded.extend(output_path.glob(f'*.{ext}'))
        downloaded.extend(output_path.glob(f'*.{ext.upper()}'))
    
    # Filter out small files (likely thumbnails)
    images = [f for f in downloaded if f.stat().st_size > 10000]  # > 10KB
    
    # Sort by modification time (newest first)
    images.sort(key=lambda x: x.stat().st_mtime, reverse=True)
    
    # Limit if specified
    if max_images:
        images = images[:max_images]
    
    return images


def scrape_pinterest_fallback(board_url: str, max_images: int = None, output_dir: str = None) -> list:
    """
    Fallback scraping method using requests + regex.
    Less reliable but works without yt-dlp.
    """
    import requests
    
    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix='pinterest_')
    
    print(f"📥 Using fallback scraper...")
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    # Get the page
    try:
        response = requests.get(board_url, headers=headers, timeout=30)
        html = response.text
    except Exception as e:
        print(f"⚠️  Failed to fetch page: {e}")
        return []
    
    # Extract image URLs
    images = []
    
    # Find all pinimg URLs
    pattern = r'https://i\.pinimg\.com/[^"\'>\s]+\.(?:jpg|jpeg|png|webp)'
    urls = re.findall(pattern, html)
    
    # Dedupe and filter
    seen = set()
    for url in urls:
        # Skip thumbnails
        if '/200x150/' in url or '/236x/' in url:
            continue
        
        # Get larger version
        url = re.sub(r'/\d+x\d+/', '/originals/', url)
        
        if url not in seen:
            seen.add(url)
            
            # Download
            try:
                img_response = requests.get(url, headers=headers, timeout=10)
                if img_response.status_code == 200 and len(img_response.content) > 10000:
                    filename = f"{len(images):04d}_{url.split('/')[-1]}"
                    filepath = Path(output_dir) / filename
                    with open(filepath, 'wb') as f:
                        f.write(img_response.content)
                    images.append(filepath)
                    
                    if max_images and len(images) >= max_images:
                        break
            except:
                pass
    
    return images


def slugify(text: str) -> str:
    """Convert text to URL-safe slug."""
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    return text.strip('-')


def load_brand_products(brand_slug: str) -> list:
    """Load brand products."""
    config_path = Path(f'brands/{brand_slug}.json')
    if not config_path.exists():
        raise FileNotFoundError(f"Brand not found: {brand_slug}")
    
    with open(config_path) as f:
        config = json.load(f)
    
    return config.get('products', [])


def load_brand_config(brand_slug: str) -> dict:
    config_path = Path(f'brands/{brand_slug}.json')
    if not config_path.exists():
        raise FileNotFoundError(f"Brand not found: {brand_slug}")

    with open(config_path) as f:
        return json.load(f)


def mark_ref_as_used(brand_slug: str, product_name: str, ref_path: Path) -> bool:
    """
    After successful ad generation, mark a ref as used:
    1. Move it from brand_assets/{brand}/references/{product}/ to used-refs/ subfolder
    2. Remove it from the website manifest (available pool)
    Returns True on success.
    """
    prod_slug = slugify(product_name)
    ref_dir = Path(f'brand_assets/{brand_slug}/references/{prod_slug}')
    used_dir = ref_dir / "used-refs"
    used_dir.mkdir(parents=True, exist_ok=True)

    dest_path = used_dir / ref_path.name
    try:
        shutil.move(str(ref_path), str(dest_path))
        print(f"      [used] Moved to used-refs: {ref_path.name}")
    except Exception as e:
        print(f"      [used] ⚠️ Could not move to used-refs: {e}")
        return False

    # Remove from website manifest
    manifest_path = REFS_DATA_DIR / f"{brand_slug}.json"
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text())
        except (json.JSONDecodeError, OSError):
            manifest = {"pools": {}, "products": []}
    else:
        manifest = {"pools": {}, "products": []}

    pools = manifest.get("pools", {})
    if prod_slug in pools:
        img_key = f"/images/refs/{brand_slug}/{prod_slug}/{ref_path.name}"
        if img_key in pools[prod_slug].get("images", []):
            pools[prod_slug]["images"].remove(img_key)
            usage = pools[prod_slug].setdefault("usage_count", {})
            usage[ref_path.name] = usage.get(ref_path.name, 0) + 1
            manifest["pools"] = pools
            manifest_path.write_text(json.dumps(manifest, indent=2))

    # Also remove the synced file from website public
    synced_file = REFS_PUBLIC_DIR / brand_slug / prod_slug / ref_path.name
    if synced_file.exists():
        synced_file.unlink()
        print(f"      [web] Removed from website pool: {ref_path.name}")

    return True


def get_pool_dir(brand_slug: str, product_name: str) -> Path:
    """Resolve the correct pool directory from brand config."""
    brand = load_brand_config(brand_slug)
    pool_dir = brand.get("paths", {}).get("pool_dir", "")
    if pool_dir:
        pool_path = Path(pool_dir)
        if brand.get("product_required"):
            return pool_path / slugify(product_name)
        return pool_path
    return Path(f'brand_assets/{brand_slug}/references/{slugify(product_name)}')


def sync_ref_to_website(brand_slug: str, product_name: str, src_path: Path, new_name: str) -> None:
    """Copy ref into website public refs and update the manifest."""
    prod_slug = slugify(product_name)
    dest_dir = REFS_PUBLIC_DIR / brand_slug / prod_slug
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / new_name
    shutil.copy2(src_path, dest_path)

    manifest_path = REFS_DATA_DIR / f"{brand_slug}.json"
    REFS_DATA_DIR.mkdir(parents=True, exist_ok=True)

    manifest: dict = {"pools": {}, "products": []}
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text())
        except (json.JSONDecodeError, OSError):
            pass

    pools = manifest.get("pools", {})
    prod_slug = slugify(product_name)
    if prod_slug not in pools:
        pools[prod_slug] = {"images": [], "usage_count": {}}
    img_path = f"/images/refs/{brand_slug}/{prod_slug}/{new_name}"
    if img_path not in pools[prod_slug]["images"]:
        pools[prod_slug]["images"].append(img_path)

    manifest["pools"] = pools
    product_entry = {"name": product_name, "slug": prod_slug}
    if product_entry not in manifest.get("products", []):
        manifest.setdefault("products", []).append(product_entry)

    manifest_path.write_text(json.dumps(manifest, indent=2))


def add_ref_to_pool(brand_slug: str, product_name: str, image_path: Path) -> str:
    """Add a reference image to the pool without generating an ad yet."""
    products = load_brand_products(brand_slug)

    # Find product
    product = None
    for p in products:
        if slugify(p['name']) == slugify(product_name):
            product = p
            break

    if not product:
        product = products[0] if products else {'name': 'default'}

    # Build ref dir from brand config
    ref_dir = get_pool_dir(brand_slug, product["name"])
    ref_dir.mkdir(parents=True, exist_ok=True)

    # Find next index
    existing = list(ref_dir.glob('*.jpg')) + list(ref_dir.glob('*.jpeg')) + list(ref_dir.glob('*.png'))
    max_num = 0
    for ref in existing:
        parts = ref.stem.split('_ref_')
        if len(parts) == 2:
            try:
                max_num = max(max_num, int(parts[1]))
            except ValueError:
                pass

    next_num = max_num + 1
    dest_name = f"{slugify(product['name'])}_ref_{next_num}{image_path.suffix.lower()}"
    dest_path = ref_dir / dest_name

    shutil.copy2(image_path, dest_path)
    try:
        sync_ref_to_website(brand_slug, product["name"], dest_path, dest_name)
        print(f"      [web] Synced to website ref pool: {dest_name}")
    except Exception as e:
        print(f"      [web] ⚠️ Sync failed: {e}")

    return str(dest_path)


def main():
    parser = argparse.ArgumentParser(description="Drain Pinterest board to ref pool")
    parser.add_argument('--brand', required=True, help="Brand slug")
    parser.add_argument('--board-url', required=True, help="Pinterest board URL (can be short URL like pin.it/...)")
    parser.add_argument('--pool', default='all', help="Pool name (default: all)")
    parser.add_argument('--max-images', type=int, default=None, help="Max images (default: all found)")
    parser.add_argument('--dry-run', action='store_true', help="Preview without downloading")
    
    args = parser.parse_args()
    
    print(f"\n{'='*50}")
    print(f"  PINTEREST BOARD DRAINER")
    print(f"{'='*50}\n")
    print(f"Brand: {args.brand}")
    print(f"Pool: {args.pool}")
    print(f"URL: {args.board_url}")
    print(f"Max images: {args.max_images or 'ALL'}\n")
    
    # Create temp directory
    with tempfile.TemporaryDirectory(prefix='pinterest_') as temp_dir:
        # Scrape images
        images = scrape_pinterest_board(args.board_url, args.max_images, temp_dir)
        
        if not images:
            print(f"\n❌ No images found!")
            print(f"\nPossible reasons:")
            print(f"  - Board is private")
            print(f"  - Board requires login")
            print(f"  - Pinterest blocking scrapers")
            print(f"\nTry:")
            print(f"  1. Make the board public temporarily")
            print(f"  2. Download images manually and use: python3 add_refs.py --images <files>")
            return 1
        
        print(f"\n📦 Found {len(images)} images\n")
        
        if args.dry_run:
            for img in images[:10]:
                print(f"  Would add: {img.name}")
            if len(images) > 10:
                print(f"  ... and {len(images) - 10} more")
            return 0
        
        # Add to pool
        results = []
        errors = []
        
        for i, img in enumerate(images, 1):
            try:
                dest = add_ref_to_pool(args.brand, args.pool, img)
                results.append(dest)
                print(f"[{i}/{len(images)}] ✅ {Path(dest).name}")
            except Exception as e:
                errors.append(str(e))
                print(f"[{i}/{len(images)}] ❌ {img.name}: {e}")
        
        # Summary
        print(f"\n{'='*50}")
        print(f"  SUMMARY")
        print(f"{'='*50}")
        print(f"\n✅ Added: {len(results)} images")
        
        if errors:
            print(f"❌ Failed: {len(errors)}")
            for err in errors[:3]:
                print(f"   {err}")
        
        # Show pool status
        pool_path = Path(f'brand_assets/{args.brand}/references/{slugify(args.pool)}')
        if pool_path.exists():
            total = len(list(pool_path.glob('*.jpg'))) + len(list(pool_path.glob('*.png')))
        print(f"\n📊 Pool '{args.pool}' now has {total} reference images")
        print(f"📝 No ads were generated automatically. Run an explicit library-generation command when you're ready.")
        
        print()
    
    return 0


if __name__ == '__main__':
    sys.exit(main())
