#!/bin/bash
# Syncs scheduled posts from output/posts/ to public/data/scheduled/
# Run this after scheduling posts

BRANDS=("island-splash" "cinco-h-ranch")
OUTPUT_DIR="/home/drewp/asset-ads/output/posts"
PUBLIC_DIR="/home/drewp/asset-ads/website/public/data/scheduled"

for brand in "${BRANDS[@]}"; do
  # Find latest batch file for this brand
  latest=$(ls "$OUTPUT_DIR"/${brand}_*.json 2>/dev/null | sort -r | head -1)
  if [ -z "$latest" ]; then
    echo "[]" > "$PUBLIC_DIR/${brand}.json"
    echo "No batches for $brand"
    continue
  fi
  
  # Extract all posts with scheduled=true (or published posts)
  python3 -c "
import json, sys
with open('$latest') as f:
    data = json.load(f)
posts = [p for p in data.get('posts', []) if p.get('scheduled') or p.get('publicUrl')]
# Remove internal fields
clean = []
for p in posts:
    clean_p = {k: v for k, v in p.items() if not k.startswith('_')}
    clean.append(clean_p)
with open('$PUBLIC_DIR/${brand}.json', 'w') as f:
    json.dump({'posts': clean, 'updated_at': data.get('created_at', '')}, f, indent=2)
print(f'$brand: {len(clean)} posts')
"
done
