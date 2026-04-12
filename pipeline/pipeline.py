"""
Island Splash Asset Ads Pipeline — Core Logic
"""

import os, sys, re, time, uuid, json, requests
from pathlib import Path
from urllib.request import urlretrieve

# ── Brand Constants ────────────────────────────────────────────────────────────

BRAND        = "Island Splash"
BRAND_ID     = "8b52b22e-722f-4227-81f2-83b212f8b5ae"
BRAND_COLORS = {"primary": "#FF6B35", "secondary": "#00B4D8", "accent": "#90BE6D"}

PRODUCTS = [
    {"name": "Mango Passion",   "file": "island-splash_mango-passion.jpg",     "emoji": "🥭", "tag": "MangoPassion"},
    {"name": "Mauby",           "file": "island-splash_mauby.jpg",             "emoji": "🌿", "tag": "Mauby"},
    {"name": "Peanut Punch",    "file": "island-splash_peanut-punch.jpg",     "emoji": "🥜", "tag": "PeanutPunch"},
    {"name": "Lime",            "file": "island-splash_lime.jpg",              "emoji": "🍋", "tag": "LimeJuice"},
    {"name": "Guava Pine",      "file": "island-splash_guava-pine.jpg",       "emoji": "🫒", "tag": "GuavaPine"},
    {"name": "Sorrel",          "file": "island-splash_sorrel.jpg",            "emoji": "🌺", "tag": "SorrelDrink"},
    {"name": "Pine Ginger",     "file": "island-splash_pine-ginger.jpg",      "emoji": "🫚", "tag": "PineGinger"},
]

# Default paths — override by setting env vars or editing these
PIPELINE_DIR   = Path(__file__).parent.parent
MEDIA_DIR      = PIPELINE_DIR / "media"
PRODUCTS_DIR   = MEDIA_DIR / "products"
LOGO_PATH      = MEDIA_DIR / "logos" / "island-splash_logo.jpg"
OUTPUT_DIR     = PIPELINE_DIR / "output"
REFS_DIR       = PIPELINE_DIR / "references"
PINTEREST_DL_DIR = Path(os.environ.get("PINTEREST_DL_DIR", str(PIPELINE_DIR.parent / "pinterest-dl")))

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
    "man holding", "woman holding", "person holding", "model", "portrait",
    "selfie", "face"
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
    if any(w in text for w in ["two", "three", "four", "multiple", "collection",
                                "set", "bottle", "can", "variety", "assortment"]):
        score += 3
    if any(w in text for w in ["tropical", "fruit", "natural", "fresh"]):
        score += 2
    return score

def find_more_refs(pinterest_url: str, num_results: int = 20) -> list[dict]:
    """
    Takes a Pinterest URL or search term, finds beverage-filtered refs.
    Falls back to direct keyword search if scrape fails.

    Returns list of {id, url, alt, src} dicts sorted by beverage score.
    """
    scraper = _get_scraper()
    all_pins = []
    seen_ids = set()

    core_terms = [
        "beverage", "juice bottle", "tropical juice", "fruit drink",
        "smoothie bottle", "energy drink", "refreshment", "plant based drink",
        "fruit juice", "tropical smoothie", "bottled juice", "clean label juice",
        "antioxidant drink", "functional beverage", "natural juice", "vibrant beverage"
    ]

    # Try to scrape the seed URL first
    try:
        seed = scraper.scrape(pinterest_url)
        seed_alt = seed.alt or ""
        if is_good_beverage_ad(seed_alt):
            all_pins.append({"id": seed.id, "url": pinterest_url,
                             "alt": seed_alt, "src": seed.src})
            seen_ids.add(seed.id)
    except Exception:
        pass

    # Keyword search for more refs
    for term in core_terms:
        try:
            results = scraper.search(term, num=num_results,
                                     min_resolution=(600, 600), delay=0.35)
            for m in results:
                if m.id not in seen_ids and is_good_beverage_ad(m.alt or ""):
                    seen_ids.add(m.id)
                    all_pins.append({"id": m.id, "url": m.src, "alt": m.alt or "", "src": m.src})
            time.sleep(0.25)
        except Exception:
            pass

    scored = [(score_beverage_ad(p["alt"]), p) for p in all_pins]
    scored.sort(key=lambda x: x[0], reverse=True)
    return [p for _, p in scored[:num_results]]

def _get_scraper():
    """Lazy-load the Pinterest scraper."""
    sys.path.insert(0, str(PINTEREST_DL_DIR / "src"))
    from pinterest_dl.scrapers.api_scraper import ApiScraper
    return ApiScraper(verbose=False)

def download_refs(refs: list[dict], output_dir: Path | None = None) -> list[Path]:
    """Download ref images. Returns list of local paths."""
    output_dir = output_dir or REFS_DIR
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for ref in refs:
        try:
            fname = output_dir / f"ref_{uuid.uuid4().hex[:8]}.jpg"
            urlretrieve(ref["src"], fname)
            paths.append(fname)
            time.sleep(0.5)
        except Exception as e:
            print(f"    Failed to download {ref['src']}: {e}")
    return paths

# ── Gemini ────────────────────────────────────────────────────────────────────

def _get_gemini():
    sys.path.insert(0, str(Path(__file__).parent.parent / "gemini-adapter" / "src"))
    try:
        from gemini import analyze_image, generate_image
        return analyze_image, generate_image
    except ImportError:
        # Fallback: try direct path
        sys.path.insert(0, "/home/drewp/asset-ads/src")
        from gemini import analyze_image, generate_image
        return analyze_image, generate_image

def analyze_ref(ref_path: Path) -> dict:
    """
    Gemini Vision analysis of a Pinterest reference image.
    Returns: {"success": bool, "analysis": str, "error": str}
    """
    analyze_fn, _ = _get_gemini()
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
    return analyze_fn(str(ref_path), prompt)

def generate_slide(
    ref_path: Path,
    product_paths: list[Path],
    slide_num: int,
    extra_prompt: str = ""
) -> Path | None:
    """
    Generate one carousel slide.
    Returns Path to output image or None on failure.
    """
    _, generate_fn = _get_gemini()

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

    output_path = OUTPUT_DIR / f"slide_{slide_num}.png"
    result = generate_fn(
        reference_image_path=str(ref_path),
        product_image_paths=[str(p) for p in all_images],
        generation_prompt=base_prompt,
        output_path=str(output_path)
    )

    if result.get("success"):
        return Path(result["output_path"])
    print(f"    Generation failed: {result.get('error', 'unknown error')}")
    return None

# ── Blotato REST API ──────────────────────────────────────────────────────────

class BlotatoClient:
    """
    Blotato REST API client — no browser, no OAuth, no MCP required.

    Usage:
        client = BlotatoClient()
        client.get_accounts()                          # list connected accounts
        client.upload_image(Path("slide_1.png"))       # → public URL string
        client.create_post(...)                        # → submission_id
        client.poll_post(submission_id)               # → final status dict
        client.post_carousel(account_id, slides, caption)  # full flow
    """

    BASE_URL = "https://backend.blotato.com/v2"

    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("BLOTATO_API_KEY")
        if not self.api_key:
            raise ValueError("BLOTATO_API_KEY environment variable is not set")
        self.headers = {
            "blotato-api-key": self.api_key,
            "Content-Type": "application/json"
        }

    # ── Account Info ────────────────────────────────────────────────────────

    def get_accounts(self) -> list[dict]:
        """List all connected social accounts."""
        r = requests.get(f"{self.BASE_URL}/users/me/accounts",
                         headers=self.headers, timeout=15)
        r.raise_for_status()
        return r.json().get("items", [])

    def get_instagram_account(self, username: str = None) -> dict | None:
        """Find an Instagram account by username (or return first IG account)."""
        accounts = self.get_accounts()
        for acct in accounts:
            if acct.get("platform") == "instagram":
                if username is None or acct.get("username") == username:
                    return acct
        return None

    # ── Media Upload ────────────────────────────────────────────────────────

    def upload_image(self, file_path: Path) -> str:
        """
        Upload an image to Blotato storage.
        Returns the permanent public URL.
        """
        r = requests.post(
            f"{self.BASE_URL}/media/uploads",
            headers=self.headers,
            json={"filename": file_path.name, "contentType": "image/png"},
            timeout=30
        )
        r.raise_for_status()
        data = r.json()
        presigned = data["presignedUrl"]

        with open(file_path, "rb") as f:
            data_bytes = f.read()

        r2 = requests.put(presigned, data=data_bytes,
                          headers={"Content-Type": "image/png"}, timeout=60)
        r2.raise_for_status()
        return data["publicUrl"]

    # ── Post Creation ──────────────────────────────────────────────────────

    def create_post(
        self,
        account_id: str,
        platform: str,
        text: str,
        media_urls: list[str] = None,
        scheduled_time: str = None,
        use_next_free_slot: bool = False,
    ) -> str:
        """
        Create a post. Returns submission_id.
        Poll with poll_post() to get final status.

        Instagram hashtag limit: max 5 hashtags in caption.
        """
        media_urls = media_urls or []

        content = {"text": text, "mediaUrls": media_urls, "platform": platform}
        target = {"targetType": platform}

        post_data = {
            "post": {
                "accountId": account_id,
                "content": content,
                "target": target,
            }
        }

        if scheduled_time:
            post_data["post"]["scheduledTime"] = scheduled_time
        if use_next_free_slot:
            post_data["post"]["useNextFreeSlot"] = True

        r = requests.post(f"{self.BASE_URL}/posts",
                         headers=self.headers, json=post_data, timeout=30)
        r.raise_for_status()
        return r.json()["postSubmissionId"]

    def poll_post(self, submission_id: str,
                  max_attempts: int = 30, interval: int = 3) -> dict:
        """
        Poll until post is published, failed, or timeout.
        Returns final status dict with at least {"status": "...", "publicUrl": "..."}.
        """
        for i in range(max_attempts):
            time.sleep(interval)
            r = requests.get(f"{self.BASE_URL}/posts/{submission_id}",
                             headers=self.headers, timeout=15)
            r.raise_for_status()
            data = r.json()
            status = data.get("status", "")
            if status == "published":
                return data
            if status == "failed":
                return data
            print(f"    [{i+1}/{max_attempts}] Status: {status} — waiting...")
        return {"status": "timeout", "postSubmissionId": submission_id}

    # ── High-Level Helpers ──────────────────────────────────────────────────

    def post_carousel(
        self,
        account_id: str,
        slide_paths: list[Path],
        caption: str,
        platform: str = "instagram",
    ) -> dict:
        """
        Full carousel posting: upload slides → create post → poll.
        Returns final status dict with publicUrl on success.
        """
        print(f"  Uploading {len(slide_paths)} slides to Blotato...")
        media_urls = []
        for i, path in enumerate(slide_paths, 1):
            url = self.upload_image(path)
            media_urls.append(url)
            print(f"    Slide {i}: {url}")

        print(f"  Creating {platform} carousel post...")
        sub_id = self.create_post(account_id, platform, caption, media_urls)
        print(f"  Submission ID: {sub_id} — polling...")

        result = self.poll_post(sub_id)
        if result.get("status") == "published":
            print(f"  ✅ PUBLISHED: {result.get('publicUrl')}")
        else:
            print(f"  ❌ Status: {result.get('status')} — {result}")
        return result

# ── Caption Builder ───────────────────────────────────────────────────────────

CTA_OPTIONS = [
    "💛 Save this carousel. Share with someone who needs a tropical escape!",
    "🏝️ Tag a friend who needs a taste of island life!",
    "💛 Drop a comment — what's YOUR flavour?!",
    "Tap the link in bio to order your case today!",
]

def build_caption(slide_products: list[dict], template_idx: int = 0) -> str:
    """
    Build carousel caption from list of {emoji, name} dicts.
    Instagram hashtag limit = 5.
    """
    # Slide descriptions
    lines = [f"S{i+1}: {p['emoji']} {p['name']}" for i, p in enumerate(slide_products)]
    flavors = " | ".join(f"{p['emoji']} {p['name']}" for p in slide_products)
    emojis  = " ".join(p["emoji"] for p in slide_products)

    templates = [
        (
            f"{emojis}\n\n"
            "Swipe through the full Island Splash lineup:\n\n" + "\n".join(lines) + "\n\n"
            "100% natural Caribbean fruit. Zero junk. All island.\n\n"
            + CTA_OPTIONS[template_idx % len(CTA_OPTIONS)] + "\n\n"
            "#IslandSplash #TropicalJuice #CaribbeanFlavours #NaturalFruit #IslandLife"
        ),
        (
            "🌺 TROPICAL lineup unlocked 🌺\n\n"
            + "\n".join(lines) + "\n\n"
            "From the Caribbean to your hands — all natural, all flavour.\n\n"
            + CTA_OPTIONS[template_idx % len(CTA_OPTIONS)] + "\n\n"
            "#IslandSplash #TropicalJuice #CaribbeanFlavours #NaturalFruit #IslandLife"
        ),
    ]
    return templates[template_idx % len(templates)]

# ── Approval Display ──────────────────────────────────────────────────────────

def display_carousel_for_approval(
    slide_paths: list[Path],
    slide_products: list[dict],
    caption: str
):
    """
    Display carousel for user review BEFORE posting.

    Shows each slide with its product/description, then the full caption.
    User must explicitly reply: "approve", "yes", "post it"  →  proceed to post
                          or: "reject", "no", "regenerate"  →  raise & let caller handle
    """
    print("\n" + "=" * 60)
    print("   🌴 CAROUSEL READY FOR APPROVAL")
    print("=" * 60 + "\n")

    for i, (path, prod) in enumerate(zip(slide_paths, slide_products), 1):
        print(f"  Slide {i}: {path}")
        print(f"  Product: {prod['emoji']} {prod['name']}")
        print()

    print("-" * 60)
    print("  CAPTION:")
    print("-" * 60)
    print("  " + "\n  ".join(caption.split("\n")))
    print()

    hashtag_line = [l for l in caption.split("\n") if l.startswith("#")]
    print("  HASHTAGS:")
    for h in hashtag_line:
        print(f"    {h}")
    print()

    print("=" * 60)
    print("  Reply:  approve / yes / post it  → post to Instagram")
    print("          reject / no / regenerate → redo generation")
    print("=" * 60 + "\n")

# ── Main Pipeline ──────────────────────────────────────────────────────────────

def run_pipeline(pinterest_url: str) -> dict:
    """
    Full end-to-end pipeline (generation only — no auto-post).

    Returns:
        {
            "success": True,
            "slide_paths": [Path, ...],
            "slide_plan": [[product, ...], ...],
            "caption": str,
            "analyses": [{"path": Path, "analysis": dict}, ...],
            "ref_paths": [Path, ...],
        }
    """
    print(f"\n🌴 Island Splash Asset Ads Pipeline")
    print(f"   Pinterest: {pinterest_url}\n")

    # 1. Find-more refs
    print("  [1/5] Finding beverage-filtered references...")
    refs = find_more_refs(pinterest_url, num_results=20)
    if not refs:
        return {"success": False, "error": "No refs found"}
    print(f"      Got {len(refs)} refs")

    # 2. Download top refs
    ref_paths = download_refs(refs[:4])
    if not ref_paths:
        return {"success": False, "error": "Failed to download refs"}
    print(f"      Downloaded {len(ref_paths)} ref images")

    # 3. Analyze refs (Gemini Vision)
    print("  [2/5] Analyzing references with Gemini Vision...")
    analyses = []
    for rp in ref_paths:
        a = analyze_ref(rp)
        analyses.append({"path": rp, "analysis": a})
        print(f"      {rp.name}: {'OK' if a.get('success') else a.get('error', 'failed')}")
        time.sleep(1)

    # 4. Assign products to slides (all 7 products across 5 slides)
    # Slide plan: spread products for variety
    slide_plan = [
        [PRODUCTS[0]],                          # Slide 1: Mango Passion (hero)
        [PRODUCTS[3], PRODUCTS[6]],             # Slide 2: Lime + Pine Ginger
        [PRODUCTS[4], PRODUCTS[5], PRODUCTS[1]],# Slide 3: Guava Pine, Sorrel, Mauby
        [PRODUCTS[2]],                          # Slide 4: Peanut Punch
        [PRODUCTS[0]],                          # Slide 5: Mango Passion CTA
    ]

    print(f"  [3/5] Generating {len(slide_plan)} slides...")
    slide_paths = []
    for i, prods in enumerate(slide_plan, 1):
        prod_paths = [PRODUCTS_DIR / p["file"] for p in prods]
        extra = f"Slide {i}: Feature {', '.join(p['name'] for p in prods)}."
        out = generate_slide(ref_paths[i % len(ref_paths)], prod_paths, i, extra)
        if out:
            slide_paths.append(out)
            print(f"      Slide {i}: {out.name}")
        else:
            print(f"      Slide {i}: FAILED")
        time.sleep(2)

    if not slide_paths:
        return {"success": False, "error": "All slide generations failed"}

    # 5. Build caption
    all_prods = [p for slide in slide_plan for p in slide]
    seen = set()
    unique_prods = []
    for p in all_prods:
        if p["name"] not in seen:
            seen.add(p["name"])
            unique_prods.append(p)

    caption = build_caption(unique_prods)
    print(f"\n  [4/5] Caption ready ({len(caption)} chars)")

    # 6. Display for approval
    print(f"\n  [5/5] Displaying carousel for approval...\n")
    display_carousel_for_approval(slide_paths, all_prods, caption)

    return {
        "success": True,
        "slide_paths": slide_paths,
        "slide_plan": slide_plan,
        "caption": caption,
        "analyses": analyses,
        "ref_paths": ref_paths,
    }

def approve_and_post(
    slide_paths: list[Path],
    caption: str,
    account_id: str = "27011"
) -> dict:
    """
    Upload and post the carousel. Call this AFTER user approval.
    """
    client = BlotatoClient()
    return client.post_carousel(account_id, slide_paths, caption)
