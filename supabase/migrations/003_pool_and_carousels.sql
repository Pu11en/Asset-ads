-- ============================================================
-- Migration 003: Asset Ads batching system - pool and carousels
-- ============================================================

-- 1. ALTER reference_links: add batching columns
ALTER TABLE reference_links ADD COLUMN IF NOT EXISTS batch_threshold int;
ALTER TABLE reference_links ADD COLUMN IF NOT EXISTS threshold_target int;
ALTER TABLE reference_links ADD COLUMN IF NOT EXISTS pinterest_title text;
ALTER TABLE reference_links ADD COLUMN IF NOT EXISTS pinterest_description text;
ALTER TABLE reference_links ADD COLUMN IF NOT EXISTS group_id uuid;

COMMENT ON COLUMN reference_links.batch_threshold IS '1=instant, 5, 10, 20. Null means manual/add-hoc';
COMMENT ON COLUMN reference_links.threshold_target IS 'Threshold this ref is waiting for: 5, 10, or 20';
COMMENT ON COLUMN reference_links.group_id IS 'Shared group_id when refs are batched into a carousel';

-- 2. CREATE carousels table
CREATE TABLE IF NOT EXISTS carousels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    group_id uuid,
    status text DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected', 'posted')),
    platform text,
    caption text,
    hashtags text,
    thumbnail_url text,
    threshold_used int,
    created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE carousels IS 'Groups of refs formed into ad carousels when pool hits threshold';

-- 3. CREATE carousel_items table
CREATE TABLE IF NOT EXISTS carousel_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    carousel_id uuid NOT NULL REFERENCES carousels(id) ON DELETE CASCADE,
    ad_id uuid NOT NULL REFERENCES generated_ads(id) ON DELETE CASCADE,
    position int NOT NULL,
    created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE carousel_items IS 'Individual ad items within a carousel';

-- 4. ALTER generated_ads: add carousel relation and Pinterest fields
ALTER TABLE generated_ads ADD COLUMN IF NOT EXISTS carousel_id uuid REFERENCES carousels(id) ON DELETE SET NULL;
ALTER TABLE generated_ads ADD COLUMN IF NOT EXISTS pinterest_title text;
ALTER TABLE generated_ads ADD COLUMN IF NOT EXISTS pinterest_description text;

-- 5. ALTER post_queues: add carousel relation and thumbnail
ALTER TABLE post_queues ADD COLUMN IF NOT EXISTS carousel_id uuid REFERENCES carousels(id) ON DELETE SET NULL;
ALTER TABLE post_queues ADD COLUMN IF NOT EXISTS thumbnail_url text;

-- 6. RLS for carousels
ALTER TABLE carousels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own carousels" ON carousels;
CREATE POLICY "Users can view own carousels" ON carousels
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own carousels" ON carousels;
CREATE POLICY "Users can insert own carousels" ON carousels
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own carousels" ON carousels;
CREATE POLICY "Users can update own carousels" ON carousels
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own carousels" ON carousels;
CREATE POLICY "Users can delete own carousels" ON carousels
    FOR DELETE USING (auth.uid() = user_id);

-- 7. RLS for carousel_items
ALTER TABLE carousel_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own carousel items" ON carousel_items;
CREATE POLICY "Users can view own carousel items" ON carousel_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM carousels
            WHERE carousels.id = carousel_items.carousel_id
            AND carousels.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert own carousel items" ON carousel_items;
CREATE POLICY "Users can insert own carousel items" ON carousel_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM carousels
            WHERE carousels.id = carousel_items.carousel_id
            AND carousels.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update own carousel items" ON carousel_items;
CREATE POLICY "Users can update own carousel items" ON carousel_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM carousels
            WHERE carousels.id = carousel_items.carousel_id
            AND carousels.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete own carousel items" ON carousel_items;
CREATE POLICY "Users can delete own carousel items" ON carousel_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM carousels
            WHERE carousels.id = carousel_items.carousel_id
            AND carousels.user_id = auth.uid()
        )
    );

-- 8. Storage bucket: ad-creatives
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ad-creatives', 'ad-creatives', true, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for ad-creatives bucket
DROP POLICY IF EXISTS "Public read access for ad-creatives" ON storage.objects;
CREATE POLICY "Public read access for ad-creatives" ON storage.objects
    FOR SELECT USING (bucket_id = 'ad-creatives');

DROP POLICY IF EXISTS "Authenticated users can upload ad-creatives" ON storage.objects;
CREATE POLICY "Authenticated users can upload ad-creatives" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'ad-creatives' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can update own ad-creatives" ON storage.objects;
CREATE POLICY "Users can update own ad-creatives" ON storage.objects
    FOR UPDATE USING (bucket_id = 'ad-creatives' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete own ad-creatives" ON storage.objects;
CREATE POLICY "Users can delete own ad-creatives" ON storage.objects
    FOR DELETE USING (bucket_id = 'ad-creatives' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Enable extensions ( idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
