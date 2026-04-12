"""Database queries for brand and product data — local SQLite only.

Everything reads/writes via the local asset-ads.db file.
"""
import sqlite3
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DB_PATH = os.environ.get("ASSET_ADS_DB", "/home/drewp/asset-ads/asset-ads.db")


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------------------------
# Brand
# ---------------------------------------------------------------------------

def get_brand(brand_id: str) -> Optional[dict]:
    """Fetch brand by ID."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM brands WHERE id = ?", (brand_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    brand = dict(row)
    if brand.get("brand_analysis"):
        try:
            brand["brand_analysis"] = json.loads(brand["brand_analysis"])
        except (json.JSONDecodeError, TypeError):
            pass
    return brand


def get_brand_by_name(name: str) -> Optional[dict]:
    """Fetch brand by name (case-insensitive)."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM brands WHERE LOWER(name) = LOWER(?)", (name,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    brand = dict(row)
    if brand.get("brand_analysis"):
        try:
            brand["brand_analysis"] = json.loads(brand["brand_analysis"])
        except (json.JSONDecodeError, TypeError):
            pass
    return brand


# ---------------------------------------------------------------------------
# Product
# ---------------------------------------------------------------------------

def get_product(product_id: str) -> Optional[dict]:
    """Fetch product by ID."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM products WHERE id = ?", (product_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return dict(row)


def get_products_for_brand(brand_id: str) -> list[dict]:
    """Fetch all products for a brand."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM products WHERE brand_id = ?", (brand_id,))
    rows = cur.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_product_by_name(brand_id: str, name: str) -> Optional[dict]:
    """Fetch a specific product by name within a brand (case-insensitive)."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM products WHERE brand_id = ? AND LOWER(name) = LOWER(?)",
        (brand_id, name),
    )
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_products_by_ids(product_ids: list[str]) -> list[dict]:
    """Fetch multiple products by their IDs, in the order requested."""
    if not product_ids:
        return []
    conn = _conn()
    cur = conn.cursor()
    cur.execute(f"SELECT * FROM products WHERE id IN ({','.join('?' * len(product_ids))})", product_ids)
    rows = cur.fetchall()
    conn.close()
    id_order = {pid: i for i, pid in enumerate(product_ids)}
    products = sorted([dict(row) for row in rows], key=lambda p: id_order.get(p["id"], 999))
    return products


def get_product_usage_counts(brand_id: str) -> dict[str, int]:
    """Return a dict mapping product_id -> number of times used in generated_ads."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT product_id FROM generated_ads WHERE brand_id = ? AND product_id IS NOT NULL",
        (brand_id,),
    )
    counts: dict[str, int] = {}
    for row in cur.fetchall():
        pid = row["product_id"]
        if pid:
            counts[pid] = counts.get(pid, 0) + 1
    conn.close()
    return counts


def get_recent_products(brand_id: str, limit: int = 7) -> list[dict]:
    """Get products for a brand, sorted by least recently used (for rotation)."""
    products = get_products_for_brand(brand_id)
    usage = get_product_usage_counts(brand_id)

    def sort_key(p: dict) -> tuple[int, datetime]:
        count = usage.get(p["id"], 0)
        created = datetime.min
        if p.get("created_at"):
            try:
                created = datetime.fromisoformat(p["created_at"].replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                pass
        return (count, created)

    products.sort(key=sort_key)
    return products[:limit]


# ---------------------------------------------------------------------------
# Generated Ads
# ---------------------------------------------------------------------------

def save_generated_ad(
    brand_id: str,
    product_id: str,
    output_image_path: str,
    reference_analysis: dict,
    prompt_used: str,
    status: str = "draft",
) -> str:
    """Save a generated ad to the local database. Returns the new ad ID."""
    import uuid
    ad_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    conn = _conn()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO generated_ads (id, brand_id, product_id, output_image_url, reference_analysis, prompt_used, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (ad_id, brand_id, product_id, output_image_path, json.dumps(reference_analysis), prompt_used, status, created_at),
    )
    conn.commit()
    conn.close()
    return ad_id


def get_generated_ads(brand_id: str = None, status: str = None, limit: int = 50) -> list[dict]:
    """Fetch generated ads, optionally filtered by brand and/or status."""
    conn = _conn()
    cur = conn.cursor()
    query = "SELECT * FROM generated_ads WHERE 1=1"
    params = []
    if brand_id:
        query += " AND brand_id = ?"
        params.append(brand_id)
    if status:
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    cur.execute(query, params)
    rows = cur.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def update_ad_status(ad_id: str, status: str) -> None:
    """Update the status of a generated ad."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute("UPDATE generated_ads SET status = ? WHERE id = ?", (status, ad_id))
    conn.commit()
    conn.close()
