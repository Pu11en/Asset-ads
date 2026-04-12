import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { platform, caption, hashtags } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Validate platform if provided
    const validPlatforms = ["instagram", "facebook", "tiktok", "pinterest", "twitter", "linkedin"];
    if (platform && !validPlatforms.includes(platform)) {
      return NextResponse.json(
        { error: `platform must be one of: ${validPlatforms.join(", ")}` },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      status: "approved",
      updated_at: new Date().toISOString(),
    };

    if (platform) {
      updateData.platform = platform;
    }

    const { data, error } = await supabase
      .from("carousels")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase update error:", error);
      return NextResponse.json(
        { error: "Failed to approve carousel" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: "Carousel not found" }, { status: 404 });
    }

    // Fetch carousel_items to get ad_ids
    const { data: items, error: itemsError } = await supabase
      .from("carousel_items")
      .select("ad_id")
      .eq("carousel_id", id);

    if (itemsError) {
      console.error("Failed to fetch carousel items:", itemsError);
      return NextResponse.json(
        { error: "Failed to fetch carousel items" },
        { status: 500 }
      );
    }

    const adIds = (items || []).map((item: { ad_id: string }) => item.ad_id);

    // Create post_queue entry
    const { data: postQueue, error: postQueueError } = await supabase
      .from("post_queues")
      .insert({
        brand_id: data.brand_id,
        carousel_id: id,
        ad_ids: adIds,
        caption: caption || null,
        hashtags: hashtags || null,
        status: "approved",
      })
      .select()
      .single();

    if (postQueueError) {
      console.error("Failed to create post_queue entry:", postQueueError);
      return NextResponse.json(
        { error: "Failed to create post_queue entry" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      carousel: data,
      post_queue_id: postQueue.id,
    });
  } catch (err) {
    console.error("POST /api/carousel/[id]/approve error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
