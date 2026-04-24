#!/usr/bin/env python3
"""
Generate brand assets JSON for the dashboard.

Run this after adding refs or changing brand assets:
  python3 skill/scripts/generate_brand_data.py
"""

import json
from pathlib import Path
from datetime import datetime


def scan_refs(brand_slug: str) -> dict:
    """Scan reference pools for a brand."""
    refs_base = Path(f'brand_assets/{brand_slug}/references')
    
    if not refs_base.exists():
        return {}
    
    pools = {}
    
    for pool_dir in refs_base.iterdir():
        if pool_dir.is_dir():
            pool_name = pool_dir.name
            images = []
            
            for img in pool_dir.glob('*'):
                if img.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']:
                    images.append({
                        'name': img.name,
                        'path': f'/images/refs/{brand_slug}/{pool_name}/{img.name}',
                        'size': img.stat().st_size,
                        'type': img.suffix.lower().replace('.', '')
                    })
            
            # Sort by name
            images.sort(key=lambda x: x['name'])
            
            pools[pool_name] = {
                'count': len(images),
                'images': images
            }
    
    return pools


def scan_products(brand_slug: str) -> list:
    """Scan product images for a brand."""
    products_base = Path(f'brand_assets/{brand_slug}/products')
    
    if not products_base.exists():
        return []
    
    products = []
    
    for img in products_base.glob('*'):
        if img.suffix.lower() in ['.jpg', '.jpeg', '.png', 'webp']:
            products.append({
                'name': img.name,
                'path': f'/images/products/{brand_slug}/{img.name}',
                'size': img.stat().st_size
            })
    
    return products


def scan_logo(brand_slug: str) -> dict:
    """Find logo for a brand."""
    logo_paths = [
        f'brand_assets/{brand_slug}/logo/logo.png',
        f'brand_assets/{brand_slug}/logo/logo.jpg',
        f'brand_assets/{brand_slug}/logo.png',
    ]
    
    for path in logo_paths:
        p = Path(path)
        if p.exists():
            return {
                'name': p.name,
                'path': f'/images/logos/{brand_slug}/{p.name}',
                'size': p.stat().st_size
            }
    
    return None


def load_brand_config(brand_slug: str) -> dict:
    """Load brand config."""
    config_path = Path(f'brands/{brand_slug}.json')
    
    if not config_path.exists():
        return {}
    
    with open(config_path) as f:
        return json.load(f)


def generate_brand_data():
    """Generate brand assets data for all brands."""
    brands_dir = Path('brands')
    
    if not brands_dir.exists():
        print("❌ No brands directory found")
        return
    
    data = {
        'generated_at': datetime.now().isoformat(),
        'brands': []
    }
    
    for config_file in brands_dir.glob('*.json'):
        brand_slug = config_file.stem
        
        print(f"Processing: {brand_slug}")
        
        config = load_brand_config(brand_slug)
        refs = scan_refs(brand_slug)
        products = scan_products(brand_slug)
        logo = scan_logo(brand_slug)
        
        brand_data = {
            'slug': brand_slug,
            'name': config.get('display_name', brand_slug),
            'tagline': config.get('identity', {}).get('tagline', ''),
            'vibe': config.get('identity', {}).get('vibe', ''),
            'palette': config.get('identity', {}).get('palette', {}),
            'logo': logo,
            'products': config.get('products', []),
            'refs': refs,
            'product_images': products,
            'total_refs': sum(p['count'] for p in refs.values())
        }
        
        data['brands'].append(brand_data)
        
        print(f"   Products: {len(products)}")
        print(f"   Logo: {'✅' if logo else '❌'}")
        print(f"   Ref pools: {len(refs)}")
        print(f"   Total refs: {brand_data['total_refs']}")
    
    # Write to website data
    output_path = Path('website/public/data/brand-assets.json')
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"\n✅ Written: {output_path}")
    
    # Also copy images to website public folder
    copy_assets_to_public()
    
    return data


def copy_assets_to_public():
    """Copy brand assets images to website public folder."""
    import shutil
    
    brands_dir = Path('brand_assets')
    
    if not brands_dir.exists():
        return
    
    # Copy refs
    refs_source = brands_dir / 'island-splash' / 'references'
    refs_dest = Path('website/public/images/refs/island-splash')
    
    if refs_source.exists():
        refs_dest.parent.mkdir(parents=True, exist_ok=True)
        
        # Copy each pool
        for pool_dir in refs_source.iterdir():
            if pool_dir.is_dir():
                pool_dest = refs_dest / pool_dir.name
                pool_dest.mkdir(parents=True, exist_ok=True)
                
                for img in pool_dir.glob('*'):
                    if img.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']:
                        shutil.copy2(img, pool_dest / img.name)
        
        print(f"✅ Copied refs to: {refs_dest}")
    
    # Copy products
    products_source = brands_dir / 'island-splash' / 'products'
    products_dest = Path('website/public/images/products/island-splash')
    
    if products_source.exists():
        products_dest.mkdir(parents=True, exist_ok=True)
        
        for img in products_source.glob('*'):
            if img.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']:
                shutil.copy2(img, products_dest / img.name)
        
        print(f"✅ Copied products to: {products_dest}")
    
    # Copy logo
    logo_source = Path('brand_assets/island-splash/logo/logo.png')
    logo_dest = Path('website/public/images/logos/island-splash/logo.png')
    
    if logo_source.exists():
        logo_dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(logo_source, logo_dest)
        print(f"✅ Copied logo to: {logo_dest}")


def main():
    print("\n" + "="*50)
    print("  GENERATING BRAND ASSETS DATA")
    print("="*50 + "\n")
    
    generate_brand_data()
    
    print("\n" + "="*50)
    print("  DONE")
    print("="*50)
    print("\nNext: Run 'npm run dev' in website/ to see the dashboard\n")


if __name__ == '__main__':
    main()
