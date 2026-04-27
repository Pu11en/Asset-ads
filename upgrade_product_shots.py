#!/usr/bin/env python3
"""Upgrade Island Splash product labels — transparent background, exact label text preserved."""
import io
import os
import time
from pathlib import Path

ENV_PATH = Path("/home/drewp/.hermes/profiles/hermes-11/.env")
with ENV_PATH.open() as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k, v)

from google.genai import Client
from google.genai.types import Blob, ImageConfig
from PIL import Image

PRODUCTS_DIR = Path("/home/drewp/splash-website/assets/products")
IMAGE_MODEL  = "gemini-3-pro-image-preview"
PROMPT = (
    "Enhance this product label into the highest quality professional studio "
    "product photography. Keep the EXACT SAME label text, design, colors, "
    "bottle shape, cap style, and every word on the label completely unchanged. "
    "The label must still say its original product name — do not alter, "
    "redraw, or replace any text on the label. "
    "Place on a fully transparent background — absolutely no background "
    "whatsoever, pure transparency. No white, no gray, no backdrop, no props. "
    "Clean soft-box lighting on the bottle only. Razor sharp, commercially perfect product shot."
)

def _image_part(path: Path) -> dict:
    img = Image.open(path)
    buf = io.BytesIO()
    fmt = "PNG" if path.suffix.lower() == ".png" else "JPEG"
    img.save(buf, format=fmt)
    mime = "image/png" if fmt == "PNG" else "image/jpeg"
    return {"inline_data": Blob(data=buf.getvalue(), mime_type=mime)}

def upgrade(client, product_path: Path) -> bytes:
    contents = [_image_part(product_path)]
    resp = client.models.generate_content(
        model=IMAGE_MODEL,
        contents=contents,
        config={
            "response_modalities": ["IMAGE"],
            "image_config": ImageConfig(aspect_ratio="1:1"),
        },
    )
    for part in resp.candidates[0].content.parts:
        if part.inline_data:
            return part.inline_data.data
    raise RuntimeError(f"No image returned for {product_path.name}")

def main():
    client = Client(api_key=os.environ["GEMINI_API_KEY"])
    product_files = sorted(PRODUCTS_DIR.glob("*.png"))
    print(f"Found {len(product_files)} products: {[p.name for p in product_files]}")

    for pf in product_files:
        out_path = PRODUCTS_DIR / f"upgraded_{pf.name}"
        print(f"\nProcessing {pf.name} …", end="", flush=True)
        try:
            img_bytes = upgrade(client, pf)
            with open(out_path, "wb") as f:
                f.write(img_bytes)
            print(f" → saved {out_path.name} ({len(img_bytes):,} bytes)")
        except Exception as e:
            print(f" FAILED: {e}")
        time.sleep(3)

    print("\nDone.")

if __name__ == "__main__":
    main()
