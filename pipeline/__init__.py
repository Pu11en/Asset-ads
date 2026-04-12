"""
Island Splash Asset Ads Pipeline
=================================
Full flow:
  1. Pinterest URL → beverage-filtered find-more (collect refs)
  2. Gemini Vision analysis on each ref
  3. Generate carousel slides (one ref + products per slide)
  4. Display carousel for USER APPROVAL (show slides + caption)
  5. User approves → Blotato REST API posts to Instagram

No Supabase. No browser. Pure REST + Gemini.
"""

from .pipeline import (
    PRODUCTS,
    BRAND_COLORS,
    BlotatoClient,
    find_more_refs,
    download_refs,
    analyze_ref,
    generate_slide,
    build_caption,
    display_carousel_for_approval,
    run_pipeline,
    approve_and_post,
)

__all__ = [
    "PRODUCTS",
    "BRAND_COLORS",
    "BlotatoClient",
    "find_more_refs",
    "download_refs",
    "analyze_ref",
    "generate_slide",
    "build_caption",
    "display_carousel_for_approval",
    "run_pipeline",
    "approve_and_post",
]
