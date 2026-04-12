"""
Island Splash Asset Ads Pipeline
Full flow: Pinterest URL → Gemini generates carousel → User approves → Blotato posts to IG
"""

import os, sys, re, time, uuid, json, requests
from pathlib import Path

# ── Brand Constants ──────────────────────────────────────────────────────────

BRAND = "Island Splash"
BRAND_ID = "8b52b22e-722f-4227-81f2-83b212f8b5ae"
BRAND_COLORS = {"primary": "#FF6B35", "secondary": "#00B4D8", "accent": "#90BE6D"}

PRODUCTS = [
    {"name": "Mango Passion",   "file": "island-splash_mango-passion.jpg",     "emoji": "🥭", "tag": "MangoPassion"},
    {"name": "Mauby",          "file": "island-splash_mauby.jpg",               "emoji": "🌿", "tag": "Mauby"},
    {"name": "Peanut Punch",   "file": "island-splash_peanut-punch.jpg",       "emoji": "🥜", "tag": "PeanutPunch"},
    {"name": "Lime",           "file": "island-splash_lime.jpg",                "emoji": "🍋", "tag": "LimeJuice"},
    {"name": "Guava Pine",     "file": "island-splash_guava-pine.jpg",          "emoji": "🫒", "tag": "GuavaPine"},
    {"name": "Sorrel",         "file": "island-splash_sorrel.jpg",              "emoji": "🌺", "tag": "SorrelDrink"},
    {"name": "Pine Ginger",    "file": "island-splash_pine-ginger.jpg",         "emoji": "🫚", "tag": "PineGinger"},
]

MEDIA_DIR    = Path(__file__).parent.parent / "media"
PRODUCTS_DIR = MEDIA_DIR / "products"
LOGO_PATH    = MEDIA_DIR / "logos" / "island-splash_logo.jpg"
OUTPUT_DIR   = Path(__file__).parent.parent / "output"
REFS_DIR     = Path(__file__).parent.parent / "references"

# ── Pinterest Find-More (beverage-filtered) ───────────────────────────────────

DRINK_WORDS = {
    "drink", "beverage", "juice", "soda", "water", "smoothie", "shake",
    "lemonade", "bottle", "can", "glass", "cup", "refreshment", "fruit",
    "tropical", "energy", "coconut", "pineapple", "mango", "berry",
    "citrus", "health", "wellness", "flavored", "sparkling", "natural"
}
JUNK_WORDS = {
    "beer", "wine", "vodka", "whiskey", "spirit", "liquor", "cocktail",
    "google", "logo", "advertisement", "banner", "fashion", "clothing",
    "makeup", "furniture", "tech", "car", "recipe", "cake", "pizza", "burger",
    "man holding", "woman holding", "person holding", "model", "portrait", "selfie", "face"
}

def is_good_beverage_ad(alt_text: str) -> bool:
    if not alt_text:
        return False
    text = alt_text.lower()
    if any(j in text for j in JUNK_WORDS):
        return False
    return any(w in text for w in DRINK_WORDS)

def score_beverage_ad(alt_text: str) -> int:
    text = alt_text.lower()
    score = sum(1 for w in DRINK_WORDS if w in text)
    if any(w in text for w in ["two", "three", "four", "multiple", "collection", "set", "bottle", "can"]):
        score += 2
    return score

def find_more_refs(pinterest_url: str, num_results: int = 20) -> list[dict]:
    """
    Takes a Pinterest URL, resolves it, then searches Pinterest for more
    beverage-filtered refs. Returns list of {id, url, alt, src} dicts.
    """
    sys.path.insert(0, str(Path(__file__).parent.parent / "pinterest-dl" / "src"))
    from pinterest_dl.scrapers.api_scraper import ApiScraper

    scraper = ApiScraper(verbose=False)

    # Scrape the seed URL first
    try:
        seed = scraper.scrape(pinterest_url)
        seed_alt = seed.alt or ""
    except Exception:
        seed_alt = ""

    # Build search terms from seed + core beverage terms
    core_terms = [
        "beverage", "juice bottle", "tropical juice", "fruit drink",
        "smoothie bottle", "energy drink", "refreshment", "plant based drink",
        "fruit juice", "tropical smoothie", "bottled juice", "clean label juice",
        "antioxidant drink", "functional beverage", "natural juice", "vibrant beverage"
    ]

    all_pins = []
    seen_ids = set()

    for term in core_terms:
        try:
            results = scraper.search(term, num=num_results, min_resolution=(600, 600), delay=0.35)
            for m in results:
                if m.id not in seen_ids and is_good_beverage_ad(m.alt or ""):
                    seen_ids.add(m.id)
                    all_pins.append({"id": m.id, "url": pinterest_url, "alt": m.alt or "", "src": m.src})
            time.sleep(0.25)
        except Exception:
            pass

    # Sort by score and return top results
    scored = [(score_beverage_ad(p["alt"]), p) for p in all_pins]
    scored.sort(key=lambda x: x[0], reverse=True)
    return [p for _, p in scored[:num_results]]

def download_refs(refs: list[dict], output_dir: Path) -> list[Path]:
    """Download ref images to output_dir. Returns list of local paths."""
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for ref in refs:
        try:
            fname = output_dir / f"ref_{uuid.uuid4().hex[:8]}.jpg"
            urllib_request = __import__("urllib.request")
            urllib_request.urlretrieve(ref["src"], fname)
            paths.append(fname)
            time.sleep(0.5)
        except Exception:
            pass
    return paths

# ── Gemini ───────────────────────────────────────────────────────────────────

def get_gemini():
    sys.path.insert(0, str(Path(__file__).parent.parent / "asset-ads" / "src"))
    from gemini import analyze_image, generate_image
    return analyze_image, generate_image

def analyze_ref(ref_path: Path) -> dict:
    """Returns Gemini's vision analysis of a Pinterest reference image."""
    analyze_image, _ = get_gemini()
    prompt = (
        "Analyze this Pinterest ad image for replication. Break it down:\n"
        "1. Ad type (lifestyle, flatlay, product hero, etc.)\n"
        "2. Layout (composition, text placement zones, focal point)\n"
        "3. Lighting (direction, quality, mood)\n"
        "4. Color mood (dominant palette, tone)\n"
        "5. Background setting and props\n"
        "6. Number of products shown\n"
        "7. Energy/feeling the ad conveys\n\n"
        "Then give a one-line PRESERVE / REPLACE / ADAPT summary:\n"
        "PRESERVE: what must stay exactly the same\n"
        "REPLACE: what product/branding elements change\n"
        "ADAPT: how to tropicalize the feel while keeping the layout"
    )
    result = analyze_image(str(ref_path), prompt)
    return result  # {"success": bool, "analysis": str, "error": str}

def generate_slide(
    ref_path: Path,
    product_paths: list[Path],
    slide_num: int,
    output_dir: Path,
    extra_prompt: str = ""
) -> Path | None:
    """Generate one carousel slide. Returns path to output image or None."""
    _, generate_image_fn = get_gemini()

    all_images = product_paths + [LOGO_PATH]

    base_prompt = (
        "Transform this Pinterest ad image into an Island Splash tropical drink ad.\n\n"
        f"{extra_prompt}\n\n"
        "BRAND: Island Splash — Caribbean-style tropical fruit drinks.\n"
        "COLORS: Primary #FF6B35 (vibrant orange), Secondary #00B4D8 (teal), Accent #90BE6D (green).\n"
        "PRESERVE: Layout, lighting, color mood, background, lifestyle feel, text placement zones.\n"
        "REPLACE: Product shown must be replaced with Island Splash bottles. "
        "Props must be replaced with tropical fruits, leaves, or natural Caribbean elements.\n"
        "ADAPT: Apply tropical color treatment (teal, orange, green) throughout. "
        "Match the lighting, shadows, and reflections of the original image so the "
        "Island Splash bottles look naturally photographed in the scene. "
        "Ensure the product label is clearly visible with the Island Splash branding."
    )

    output_path = output_dir / f"slide_{slide_num}.png"
    result = generate_image_fn(
        reference_image_path=str(ref_path),
        product_image_paths=[str(p) for p in all_images],
        generation_prompt=base_prompt,
        output_path=str(output_path)
    )

    if result.get("success"):
        return Path(result["output_path"])
    return None

# ── Blotato REST API ───────────────────────────────────────────────────────────

class BlotatoClient:
    BASE_URL = "https://backend.blotato.com/v2"

    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("BLOTATO_API_KEY")
        if not self.api_key:
            raise ValueError("BLOTATO_API_KEY not set")
        self.headers = {
            "blotato-api-key": self.api_key,
            "Content-Type": "application/json"
        }

    def get_accounts(self) -> list[dict]:
        r = requests.get(f"{self.BASE_URL}/users/me/accounts", headers=self.headers)
        return r.json().get("items", [])

    def upload_image(self, file_path: Path) -> str:
        """Upload an image to Blotato storage. Returns public URL."""
        r = requests.post(
            f"{self.BASE_URL}/media/uploads",
            headers=self.headers,
            json={"filename": file_path.name, "contentType": "image/png"}
        )
        data = r.json()
        presigned = data["presignedUrl"]
        with open(file_path, "rb") as f:
            data_bytes = f.read()
        r2 = requests.put(presigned, data=data_bytes, headers={"Content-Type": "image/png"})
        r2.raise_for_status()
        return data["publicUrl"]

    def create_carousel_post(
        self,
        account_id: str,
        media_urls: list[str],
        caption: str,
        platform: str = "instagram"
    ) -> str:
        """Create a carousel post. Returns submission_id. IG hashtag limit = 5."""
        payload = {
            "post": {
                "accountId": account_id,
                "content": {
                    "text": caption,
                    "mediaUrls": media_urls,
                    "platform": platform
                },
                "target": {"targetType": platform}
            }
        }
        r = requests.post(f"{self.BASE_URL}/posts", headers=self.headers, json=payload)
        r.raise_for_status()
        return r.json()["postSubmissionId"]

    def poll_post(self, submission_id: str, max_attempts: int = 30, interval: int = 3) -> dict:
        """Poll until post is published or failed."""
        for _ in range(max_attempts):
            time.sleep(interval)
            r = requests.get(f"{self.BASE_URL}/posts/{submission_id}", headers=self.headers)
            data = r.json()
            status = data.get("status")
            if status == "published":
                return data
            elif status == "failed":
                return data
        return {"status": "timeout", "submissionId": submission_id}

    def post_carousel(
        self,
        account_id: str,
        slide_paths: list[Path],
        caption: str,
        platform: str = "instagram"
    ) -> dict:
        """Full upload → post → poll flow. Returns final status dict."""
        print(f"  Uploading {len(slide_paths)} slides...")
        media_urls = [self.upload_image(p) for p in slide_paths]
        print(f"  Creating carousel post...")
        sub_id = self.create_carousel_post(account_id, media_urls, caption, platform)
        print(f"  Polling (ID: {sub_id})...")
        return self.poll_post(sub_id)

# ── Caption Builder ───────────────────────────────────────────────────────────

CAPTION_TEMPLATES = [
    "🌴 {flavors}\n\n{description}\n\n100% natural Caribbean fruit. No artificial anything.\n\n💛 {cta}",
    "🌺 TROPICAL lineup unlocked 🌺\n\n{description}\n\n{flavors}\n\nMade from real fruit. No concentrates. No preservatives.\n\n{cta}",
    "Is your favourite in here? {flavors_emoji}\n\n{description}\n\nFrom the Caribbean to your hands — {flavors_short}.\n\n{cta}",
]

CTA_OPTIONS = [
    "Save this carousel. Share with someone who needs a tropical escape.",
    "Tag a friend who needs a taste of the islands! 🏝️",
    "Drop a 💛 if you're ready for island life!",
    "Tap the link in bio to order your case today.",
]

def build_caption(slide_products: list[dict], template_idx: int = 0) -> str:
    """Build carousel caption from list of slide→product mappings."""
    # Group by slide
    slide_descriptions = []
    for i, prod in enumerate(slide_products, 1):
        slide_descriptions.append(f"S{i}: {prod['emoji']} {prod['name']}")

    all_flavors = " | ".join(p["emoji"] + " " + p["name"] for p in slide_products)
    all_flavors_short = " / ".join(p["name"] for p in slide_products[:4])
    if len(slide_products) > 4:
        all_flavors_short += f" +{len(slide_products)-4} more"

    emojis = " ".join(p["emoji"] for p in slide_products)

    descriptions = [
        f"Swipe through the full Island Splash lineup:\n\n" + "\n".join(slide_descriptions),
        f"All 7 Island Splash flavours represented:\n\n" + ", ".join(s["emoji"] + " " + s["name"] for s in slide_products),
    ]
    desc = descriptions[template_idx % len(descriptions)]
    cta = CTA_OPTIONS[template_idx % len(CTA_OPTIONS)]

    caption = f"{emojis}\n\n{desc}\n\n100% natural fruit. Zero junk. All island.\n\n{cta}\n\n#IslandSplash #TropicalJuice #CaribbeanFlavours #NaturalFruit #IslandLife"
    return caption

# ── Approval Display ──────────────────────────────────────────────────────────

def display_carousel_for_approval(slide_paths: list[Path], slide_products: list[dict], caption: str):
    """
    Show the carousel slides sequentially for user approval.
    This is called BEFORE posting — user reviews each slide then approves or rejects.

    Format:
      Slide 1: [image path] — Mango Passion (tropical lifestyle)
      Slide 2: [image path] — Lime + Pine Ginger combo
      ...
      Caption: "🌴 TROPICAL lineup..."
      Hashtags: #IslandSplash #TropicalJuice #CaribbeanFlavours #NaturalFruit #IslandLife

    After displaying, wait for user to say "approve", "yes", "post it", etc.
    or "reject", "no", "regenerate", etc.
    """
    print("\n" + "="*60)
    print("   CAROUSEL READY FOR APPROVAL")
    print("="*60)

    for i, (path, prod) in enumerate(zip(slide_paths, slide_products), 1):
        print(f"\n  Slide {i}: {path}")
        print(f"  Product:  {prod['emoji']} {prod['name']}")

    print(f"\n  Caption preview:")
    # Show first 200 chars of caption
    preview = caption[:200] + "..." if len(caption) > 200 else caption
    print(f"  {preview}")

    print("\n  Hashtags: #IslandSplash #TropicalJuice #CaribbeanFlavours #NaturalFruit #IslandLife")
    print("\n" + "="*60)
    print("  Reply: 'approve' / 'yes' / 'post it' to post to IG")
    print("  Reply: 'reject' / 'no' / 'regenerate' to redo")
    print("="*60 + "\n")

# ── Main Pipeline ─────────────────────────────────────────────────────────────

def run_pipeline(pinterest_url: str, account_id: str = "27011") -> dict:
    """
    Full end-to-end pipeline. Call this after user has approved the carousel.

    1. Find-more refs from Pinterest URL (beverage-filtered)
    2. Analyze top refs with Gemini Vision
    3. Assign products to slides (7 products across 5 slides)
    4. Generate each slide
    5. Stitch into carousel image
    6. Return paths + caption for approval display
    """
    print(f"\n🌴 Island Splash Asset Ads Pipeline")
    print(f"   Pinterest: {pinterest_url}")
    print(f"   Account:   {account_id}\n")

    # Step 1: Find-more
    print("  [1/5] Finding beverage-filtered references...")
    refs = find_more_refs(pinterest_url, num_results=20)
    if not refs:
        return {"success": False, "error": "No refs found"}
    print(f"      Got {len(refs)} refs")

    # Step 2: Download top refs
    ref_paths = download_refs(refs[:4], REFS_DIR)
    if not ref_paths:
        return {"success": False, "error": "Failed to download refs"}
    print(f"      Downloaded {len(ref_paths)} ref images")

    # Step 3: Analyze refs (Gemini Vision)
    print("  [2/5] Analyzing reference images with Gemini Vision...")
    analyses = []
    for rp in ref_paths:
        a = analyze_ref(rp)
        analyses.append({"path": rp, "analysis": a})
        time.sleep(1)

    # Step 4: Assign products to slides (all 7 products across 5 slides)
    # Strategy: spread products across slides, maximize variety
    slide_plan = [
        [PRODUCTS[0]],                                    # Slide 1: Mango Passion (hero)
        [PRODUCTS[3], PRODUCTS[6]],                       # Slide 2: Lime + Pine Ginger
        [PRODUCTS[4], PRODUCTS[5], PRODUCTS[1]],         # Slide 3: Guava Pine, Sorrel, Mauby
        [PRODUCTS[2]],                                    # Slide 4: Peanut Punch
        [PRODUCTS[0]],                                    # Slide 5: Mango Passion (CTA)
    ]

    print(f"  [3/5] Generating {len(slide_plan)} slides with Gemini...")
    slide_paths = []
    for i, prods in enumerate(slide_plan, 1):
        prod_paths = [PRODUCTS_DIR / p["file"] for p in prods]
        extra = f"Slide {i}: Feature {', '.join(p['name'] for p in prods)}."
        out = generate_slide(ref_paths[i % len(ref_paths)], prod_paths, i, OUTPUT_DIR, extra)
        if out:
            slide_paths.append(out)
            print(f"      Slide {i}: {out.name} ({', '.join(p['name'] for p in prods)})")
        time.sleep(2)

    if not slide_paths:
        return {"success": False, "error": "All slide generations failed"}

    # Step 5: Build caption
    all_prods_in_carousel = [p for slide in slide_plan for p in slide]
    # Dedupe while preserving order
    seen = set(); unique_prods = []
    for p in all_prods_in_carousel:
        if p["name"] not in seen:
            seen.add(p["name"]); unique_prods.append(p)

    caption = build_caption(unique_prods)

    print(f"  [4/5] Caption ready ({len(caption)} chars)")
    print(f"  [5/5] Displaying carousel for approval...")

    return {
        "success": True,
        "slide_paths": slide_paths,
        "slide_plan": slide_plan,
        "caption": caption,
        "analyses": analyses,
        "ref_paths": ref_paths,
    }

def approve_and_post(slide_paths: list[Path], caption: str, account_id: str = "27011") -> dict:
    """
    Called AFTER user approves. Uploads slides to Blotato and posts.
    """
    print("\n  ✅ APPROVED — uploading to Blotato and posting...")
    client = BlotatoClient()
    result = client.post_carousel(account_id, slide_paths, caption)
    return result
