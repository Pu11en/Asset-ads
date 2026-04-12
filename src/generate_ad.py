"""Main ad generation pipeline — local-only, no Supabase.

Orchestrates:
1. Receive reference ad image (local file or Pinterest URL)
2. Analyze reference with Gemini vision
3. Pull brand + product(s) from local SQLite
4. Build generation prompt
5. Generate new ad image with Gemini
6. Save to local output/ directory and record in SQLite

Usage:
    from generate_ad import run_pipeline

    result = run_pipeline(
        reference_image_path="/path/to/reference.jpg",
        brand_name="Island Splash",
        product_name="Mango Passion",
    )
"""
import sys
from pathlib import Path as _Path
sys.path.insert(0, str(_Path(__file__).parent))
import logging
import uuid
from pathlib import Path
import re
import requests

CURRENT_USER_ID = "default-user"

from src import db, gemini, prompt_builder

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("generate_ad")


# ---------------------------------------------------------------------------
# Pinterest
# ---------------------------------------------------------------------------

_ALLOWED_MEDIA_DOMAINS = frozenset([
    "pinterest.com",
    "pinimg.com",
    "i.pinimg.com",
    "v1.pinimg.com",
    "v2.pinimg.com",
    "v3.pinimg.com",
])


def fetch_pinterest_media(pinterest_url: str) -> dict:
    """Resolve a Pinterest URL and fetch the image.

    Saves the image locally in references/. Returns dict with local_path.
    """
    session = requests.Session()
    session.headers["User-Agent"] = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    response = session.get(pinterest_url, allow_redirects=True, timeout=15)
    final_url = response.url
    html = response.text

    title = None
    for pat in [
        r'<meta\s+property=["\']og:title["\']\s+content=["\']([^"\']+)["\']',
        r'<meta\s+[^>]*name=["\']og:title["\'][^>]*content=["\']([^"\']+)["\']',
        r'<title>([^<]+)</title>',
    ]:
        m = re.search(pat, html)
        if m:
            title = m.group(1)
            break

    # Try og:image first
    for pat in [
        r'<meta\s+property=["\']og:image["\']\s+content=["\']([^"\']+)["\']',
        r'<meta\s+[^>]*name=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']',
    ]:
        m = re.search(pat, html)
        if m:
            url = m.group(1)
            if url.startswith("//"):
                url = "https:" + url
            media_bytes = _fetch_bytes(url, session)
            return _save_locally(media_bytes, "jpg", title, final_url)

    # Fallback: any i.pinimg.com image
    m = re.search(r'(https?://i\.pinimg\.com/[^\s"\'\\]+)', html)
    if m:
        url = m.group(1)
        media_bytes = _fetch_bytes(url, session)
        return _save_locally(media_bytes, "jpg", title, final_url)

    raise ValueError(f"Could not extract image from Pinterest URL: {final_url}")


def _fetch_bytes(url: str, session: requests.Session) -> bytes:
    """Fetch bytes from a URL with SSRF protection."""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]
        if domain not in _ALLOWED_MEDIA_DOMAINS:
            raise ValueError(f"SSRF block: {url}")
    except ValueError:
        raise
    resp = session.get(url, timeout=30)
    resp.raise_for_status()
    return resp.content


def _save_locally(media_bytes: bytes, ext: str, title: str, _resolved_url: str) -> dict:
    """Save media bytes to local references/ directory. Returns dict with local_path."""
    safe_title = re.sub(r'[^a-zA-Z0-9._-]', '_', (title or "ref")[:30])
    filename = f"pinterest_ref_{safe_title}_{uuid.uuid4().hex[:6]}.{ext}"
    out_path = Path(__file__).parent.parent / "references" / filename
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(media_bytes)
    return {"local_path": str(out_path), "title": title}


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def run_pipeline(
    reference_image_path: str = None,
    brand_name: str = "Island Splash",
    product_name: str = None,
    product_names: list[str] = None,
    product_count: int = None,
    output_dir: str = None,
    reference_pinterest_url: str = None,
) -> dict:
    """Run the full ad generation pipeline.

    Product selection priority:
    1. If product_names is provided -- use those specific products
    2. If product_name is provided -- use that single product
    3. If product_count is provided -- auto-select that many least-recently-used products
    4. Otherwise -- read product_count from the reference ad analysis, then auto-select

    Args:
        reference_image_path: Path to a local reference ad image
        reference_pinterest_url: Pinterest URL to auto-resolve (saves locally)
        brand_name: Name of the brand to use
        product_name: Specific product to feature
        product_names: List of specific products to feature
        product_count: How many products to feature (overrides auto-detection)
        output_dir: Directory to save generated images

    Returns:
        dict with success, generated_image_path, reference_analysis,
        generation_prompt, products_used, brand_used, ad_id, error
    """
    output_dir = Path(output_dir) if output_dir else Path(__file__).parent.parent / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    _reference_path = reference_image_path

    # Resolve Pinterest URL if provided
    if reference_pinterest_url:
        logger.info(f"Fetching Pinterest URL: {reference_pinterest_url}")
        try:
            result = fetch_pinterest_media(reference_pinterest_url)
            _reference_path = result["local_path"]
            logger.info(f"Saved to: {_reference_path}")
        except Exception as e:
            logger.error(f"Pinterest URL failed: {e}")
            return {"success": False, "error": f"Pinterest URL failed: {e}"}

    if not _reference_path:
        return {"success": False, "error": "No reference image provided"}

    # Load brand
    brand = db.get_brand_by_name(brand_name)
    if not brand:
        return {"success": False, "error": f"Brand '{brand_name}' not found"}

    # Select products
    products = _select_products(brand, product_names, product_name, product_count, _reference_path)
    if not products:
        return {"success": False, "error": "No products selected"}

    # Verify product images exist locally
    for product in products:
        img_path = product.get("image_local_path")
        if not img_path or not Path(img_path).exists():
            return {
                "success": False,
                "error": f"Product image not found: {img_path}",
            }

    product_names_used = [p["name"] for p in products]
    logger.info(f"Selected products: {product_names_used}")

    # Analyze reference ad
    logger.info("Analyzing reference ad...")
    ref_analysis = analyze_reference_ad(_reference_path)
    if not ref_analysis.get("success"):
        return {
            "success": False,
            "error": f"Reference analysis failed: {ref_analysis.get('error')}",
            "reference_analysis": ref_analysis,
        }

    logger.info(f"Reference product count: {ref_analysis.get('product_count', 'unknown')}")

    # Build generation prompt
    logger.info(f"Building generation prompt for {len(products)} product(s)...")
    generation_prompt = prompt_builder.build_generation_prompt(
        reference_analysis=ref_analysis,
        brand=brand,
        products=products,
    )

    # Generate the ad image
    logger.info("Generating ad image with Gemini...")
    output_filename = (
        f"{brand['name'].lower().replace(' ', '-')}_"
        f"{'-'.join(p['name'].lower().replace(' ', '-') for p in products)}_"
        f"{uuid.uuid4().hex[:8]}.jpg"
    )
    output_path = output_dir / output_filename

    # Use local product image paths
    product_image_paths = [p["image_local_path"] for p in products]
    gen_result = gemini.generate_image(
        reference_image_path=_reference_path,
        product_image_paths=product_image_paths,
        generation_prompt=generation_prompt,
        output_path=str(output_path),
    )

    if not gen_result.get("success"):
        return {
            "success": False,
            "error": f"Image generation failed: {gen_result.get('error')}",
            "reference_analysis": ref_analysis,
            "generation_prompt": generation_prompt,
            "model_output": gen_result.get("model_output", ""),
        }

    # Save to local database
    ad_ids = []
    for product in products:
        ad_id = db.save_generated_ad(
            brand_id=brand["id"],
            product_id=product["id"],
            output_image_path=str(output_path),
            reference_analysis=ref_analysis,
            prompt_used=generation_prompt,
            status="draft",
        )
        ad_ids.append(ad_id)
        logger.info(f"Saved ad {ad_id} for product {product['name']}")

    return {
        "success": True,
        "generated_image_path": str(output_path),
        "ad_ids": ad_ids,
        "reference_analysis": ref_analysis,
        "generation_prompt": generation_prompt,
        "products_used": products,
        "brand_used": brand,
    }


def _select_products(
    brand: dict,
    product_names: list[str] = None,
    product_name: str = None,
    product_count: int = None,
    reference_image_path: str = None,
) -> list[dict]:
    """Select products for the ad based on priority rules."""
    if product_names:
        products = []
        for name in product_names:
            p = db.get_product_by_name(brand["id"], name)
            if p:
                products.append(p)
        return products

    if product_name:
        product = db.get_product_by_name(brand["id"], product_name)
        if product:
            return [product]
        product_count = 1

    if product_count is not None:
        return db.get_recent_products(brand["id"], limit=product_count)

    if reference_image_path:
        ref_analysis = analyze_reference_ad(reference_image_path)
        if ref_analysis.get("success"):
            count = prompt_builder.determine_product_count(ref_analysis)
            return db.get_recent_products(brand["id"], limit=count)

    return db.get_recent_products(brand["id"], limit=1)


def analyze_reference_ad(image_path: str) -> dict:
    """Analyze a reference ad image using Gemini vision."""
    analysis_prompt = prompt_builder.build_reference_analysis_prompt()
    result = gemini.analyze_image(image_path, analysis_prompt)

    if not result.get("success"):
        return result

    text = result["analysis"]
    structured = _parse_analysis_text(text)
    structured["raw_analysis"] = text
    structured["success"] = True
    return structured


def _parse_analysis_text(text: str) -> dict:
    """Parse the raw analysis text into a structured dict."""
    result = {}
    current_section = None
    section_content = []

    def save_section(key: str, content: list[str]):
        if key and content:
            result[key] = "\n".join(content).strip()

    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue

        header_markers = [
            ("AD TYPE", "ad_type"),
            ("COMPOSITION", "composition"),
            ("LAYOUT", "composition"),
            ("CAMERA", "camera_framing"),
            ("FRAMING", "camera_framing"),
            ("LIGHTING", "lighting"),
            ("BACKGROUND", "background"),
            ("ENVIRONMENT", "background"),
            ("COLOR PALETTE", "color_palette"),
            ("COLORS", "color_palette"),
            ("TEXT OVER", "text_overlays"),
            ("BRANDING", "text_overlays"),
            ("PRODUCT VIS", "product_visibility"),
            ("PERSUASION", "persuasion_cues"),
            ("PRESERVE", "preserve_elements"),
            ("REPLACE", "replace_elements"),
            ("ADAPT", "adapt_elements"),
            ("PRODUCT COUNT", "product_count"),
            ("ENERGY", "energy"),
            ("FEEL", "energy"),
        ]

        matched = False
        for prefix, key in header_markers:
            if prefix in line.upper():
                save_section(current_section, section_content)
                current_section = key
                section_content = []
                matched = True
                break

        if not matched:
            section_content.append(line)

    save_section(current_section, section_content)

    for key in ["preserve_elements", "replace_elements", "adapt_elements"]:
        if key in result:
            items = [l.strip("- ").strip() for l in result[key].split("\n") if l.strip()]
            result[key] = items

    pc = result.get("product_count", "1")
    result["product_count"] = str(pc).strip()

    for key in ["preserve_elements", "replace_elements", "adapt_elements"]:
        if key not in result:
            result[key] = []

    return result
