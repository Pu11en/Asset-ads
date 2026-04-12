import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent";

// Build reference analysis prompt (same as prompt_builder.py)
function buildReferenceAnalysisPrompt(): string {
  return `Analyze this reference ad image thoroughly for use as a template for a new brand's ad campaign.

Provide a detailed breakdown with these specific sections:

AD TYPE / STYLE: What type of ad is this? (e.g., lifestyle, product hero, testimonial, etc.)

COMPOSITION / LAYOUT: Describe the overall layout structure. Where is the focal point? How is visual weight distributed?

CAMERA / FRAMING: What's the angle, shot type, and framing? (e.g., overhead, 45-degree, close-up product shot)

LIGHTING TYPE + MOOD: Describe the lighting setup and the mood it creates. (e.g., warm natural, dramatic studio, soft diffused)

BACKGROUND / ENVIRONMENT: What's in the background? Any environments, gradients, or abstract elements?

COLOR PALETTE: What are the dominant and accent colors? Describe the overall color mood.

TEXT OVERLAYS / BRANDING: Is there text in the ad? What does it say? Where is it placed?

PRODUCT VISIBILITY: How is the product featured? Is it the hero? Multiple products? How prominent?

PERSUASION CUES: What psychological or emotional triggers are used? (e.g., lifestyle aspiration, health signal, social proof)

PRESERVE ELEMENTS: List specific elements from this ad that should be PRESERVED when adapting it for a new brand (layout, mood, style, etc.)

REPLACE ELEMENTS: List specific elements that MUST be REPLACED for the new brand (product, logo, specific props, etc.)

ADAPT ELEMENTS: List elements that should be INTELLIGENTLY ADAPTED rather than wholesale replaced (color treatment, general lighting mood, compositional balance)

PRODUCT COUNT: How many distinct products are featured? Respond with a number: 1, 2, 3, or "many" if 4 or more.

ENERGY / FEEL: Describe the overall emotional feel of this ad in 2-3 words (e.g., "fresh and tropical", "bold and energetic", "calm and wellness-focused")`;
}

function parseReferenceAnalysis(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split("\n");
  let currentSection: string | null = null;
  let sectionContent: string[] = [];

  const headerMarkers: [string, string][] = [
    ["AD TYPE", "ad_type"],
    ["COMPOSITION", "composition"],
    ["LAYOUT", "composition"],
    ["CAMERA", "camera_framing"],
    ["FRAMING", "camera_framing"],
    ["LIGHTING", "lighting"],
    ["BACKGROUND", "background"],
    ["ENVIRONMENT", "background"],
    ["COLOR PALETTE", "color_palette"],
    ["COLORS", "color_palette"],
    ["TEXT OVER", "text_overlays"],
    ["BRANDING", "text_overlays"],
    ["PRODUCT VIS", "product_visibility"],
    ["PERSUASION", "persuasion_cues"],
    ["PRESERVE", "preserve_elements"],
    ["REPLACE", "replace_elements"],
    ["ADAPT", "adapt_elements"],
    ["PRODUCT COUNT", "product_count"],
    ["ENERGY", "energy"],
    ["FEEL", "energy"],
  ];

  const saveSection = () => {
    if (currentSection && sectionContent.length > 0) {
      result[currentSection] = sectionContent.join("\n").trim();
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let matched = false;
    for (const [prefix, key] of headerMarkers) {
      if (trimmed.toUpperCase().startsWith(prefix)) {
        saveSection();
        currentSection = key;
        sectionContent = [];
        matched = true;
        break;
      }
    }
    if (!matched) {
      sectionContent.push(trimmed);
    }
  }
  saveSection();

  for (const key of ["preserve_elements", "replace_elements", "adapt_elements"]) {
    if (typeof result[key] === "string") {
      const items = (result[key] as string)
        .split("\n")
        .map((l: string) => l.replace(/^[-*]\s*/, "").trim())
        .filter((l: string) => l.length > 0);
      result[key] = items;
    } else {
      result[key] = [];
    }
  }

  return result;
}

async function analyzeWithGemini(imageUrl: string, prompt: string): Promise<{
  success: boolean;
  analysis?: string;
  error?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "GEMINI_API_KEY not configured" };
  }

  try {
    const imageResponse = await fetch(imageUrl, { });
    if (!imageResponse.ok) {
      return { success: false, error: `Failed to fetch image: ${imageResponse.status}` };
    }
    const imageBytes = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBytes).toString("base64");

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64,
              },
            },
          ],
        },
      ],
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      ],
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)});

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.error?.message || `HTTP ${response.status}`,
      };
    }

    const candidates = result.candidates || [];
    if (!candidates.length) {
      return { success: false, error: "No candidates in response" };
    }

    const content = candidates[0].content || {};
    const parts = content.parts || [];
    const text = parts.map((p: { text?: string }) => p.text || "").join("\n");

    return { success: true, analysis: text };
  } catch (e: any) {
    return { success: false, error: e.message || "Analysis failed" };
  }
}

async function generateWithGemini(
  referenceImageUrl: string,
  productImageUrls: string[],
  generationPrompt: string
): Promise<{ success: boolean; imageBase64?: string; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "GEMINI_API_KEY not configured" };
  }

  try {
    const refResponse = await fetch(referenceImageUrl, { });
    if (!refResponse.ok) {
      return { success: false, error: `Failed to fetch reference image: ${refResponse.status}` };
    }
    const refBytes = await refResponse.arrayBuffer();
    const refBase64 = Buffer.from(refBytes).toString("base64");

    const parts: any[] = [
      {
        text: `You are an expert advertising creative director. Transform this reference ad image using the product image(s) provided. Follow the transformation instructions carefully.\n\nIMPORTANT: Output a 4:5 aspect ratio static image suitable for social media advertising.\n\nTRANSFORMATION PROMPT:\n${generationPrompt}`,
      },
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: refBase64,
        },
      },
    ];

    for (const productUrl of productImageUrls) {
      const prodResponse = await fetch(productUrl, { });
      if (!prodResponse.ok) continue;
      const prodBytes = await prodResponse.arrayBuffer();
      const prodBase64 = Buffer.from(prodBytes).toString("base64");
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: prodBase64,
        },
      });
    }

    const payload = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      ],
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)});

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.error?.message || `HTTP ${response.status}`,
      };
    }

    const candidates = result.candidates || [];
    if (!candidates.length) {
      return { success: false, error: "No candidates in response" };
    }

    const content = candidates[0].content || {};
    const partsOut = content.parts || [];

    for (const part of partsOut) {
      if (part.inlineData && part.inlineData.data) {
        return { success: true, imageBase64: part.inlineData.data };
      }
    }

    return { success: false, error: "No image in response" };
  } catch (e: any) {
    return { success: false, error: e.message || "Generation failed" };
  }
}

async function uploadToSupabaseStorage(
  imageBase64: string,
  bucket: string,
  path: string
): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;

  const bytes = Buffer.from(imageBase64, "base64");

  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/${bucket}/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
      },
      body: bytes,
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Upload failed [${response.status}]: ${body}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

function getDefaultBrand(): {
  name: string;
  id: string;
  flavor_profile: string;
  health_claims: string;
  brand_analysis: { colors: Record<string, string>; brand_feel: string };
} {
  return {
    name: "Island Splash",
    id: "8b52b22e-722f-4227-81f2-83b212f8b5ae",
    flavor_profile: "tropical, Caribbean",
    health_claims: "natural fruits, no artificial additives",
    brand_analysis: {
      colors: {
        primary: "#FF6B35",
        secondary: "#00B4D8",
        accent: "#90BE6D",
      },
      brand_feel: "tropical, fun, fresh, friendly",
    },
  };
}

// Get products from DB
async function getDefaultProducts(brandId?: string): Promise<Array<{
  id: string;
  name: string;
  description: string;
  ingredients: string;
  image_url: string;
  target_audience: string;
  cta: string;
}>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const brand_id = brandId || "8b52b22e-722f-4227-81f2-83b212f8b5ae";

  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, description, ingredients, image_url, target_audience, cta")
    .eq("brand_id", brand_id)
    .not("image_url", "is", null);

  if (error || !products || products.length === 0) {
    return [];
  }

  return products.map((p) => ({
    id: p.id,
    name: p.name || "",
    description: p.description || "",
    ingredients: p.ingredients || "",
    image_url: p.image_url || "",
    target_audience: p.target_audience || "",
    cta: p.cta || "",
  }));
}

function buildGenerationPromptTS(
  referenceAnalysis: Record<string, unknown>,
  brand: { name: string; flavor_profile: string; health_claims: string; brand_analysis: { colors: Record<string, string>; brand_feel: string } },
  products: Array<{ name: string; description: string; ingredients: string; image_url: string; target_audience: string; cta: string }>
): string {
  const sections: string[] = [];

  const adType = (referenceAnalysis.ad_type as string) || "lifestyle beverage ad";
  const productNames = products.map((p) => p.name).join(", ");
  sections.push(
    `AD TYPE: Transform this reference ${adType} into a new ad for ${brand.name} featuring: ${productNames}.`
  );

  const preserve = (referenceAnalysis.preserve_elements as string[]) || [
    "Overall composition and layout structure",
    "Lighting mood and atmosphere",
    "Background environment and depth",
    "Ad angle and perspective",
    "Color mood (not exact colors — those get brand-mapped)",
    "Text placement zones",
    "Lifestyle scene energy and feel",
  ];
  sections.push(
    "PRESERVE from the reference ad:\n" +
      preserve.map((p) => `  - ${p}`).join("\n")
  );

  const replace = (referenceAnalysis.replace_elements as string[]) || [
    "Product in the reference → swap to the target product",
    "Brand logo/wordmark → use the brand's actual logo",
    "Packaging/label → show the actual product packaging",
    "Any beverage-specific props → match to product ingredients",
    "Background color treatment → brand's tropical palette",
  ];
  sections.push(
    "REPLACE with brand/product elements:\n" +
      replace.map((r) => `  - ${r}`).join("\n")
  );

  const adapt = (referenceAnalysis.adapt_elements as string[]) || [
    "Color treatment → map to brand's tropical color palette (teal, orange, golden)",
    "Props → use the brand's ingredient cues (fruits, leaves, natural elements)",
    "Product reflections/shine → match the target product's material (glass/plastic)",
    "Spacing and framing → flex to fit the new product's packaging shape",
  ];
  sections.push(
    "ADAPT intelligently:\n" + adapt.map((a) => `  - ${a}`).join("\n")
  );

  sections.push(
    "BRAND CONTEXT:\n" +
      `  - Brand: ${brand.name}\n` +
      `  - Flavor Profile: ${brand.flavor_profile}\n` +
      `  - Health Claims: ${brand.health_claims}\n` +
      `  - Brand Feel: ${brand.brand_analysis.brand_feel}`
  );

  const logoColors = brand.brand_analysis.colors;
  if (logoColors && Object.keys(logoColors).length > 0) {
    const colorParts: string[] = [];
    for (const [k, v] of Object.entries(logoColors)) {
      if (v && (v.startsWith("#") || !v.includes("#()"))) {
        colorParts.push(`${k.replace("_", " ")}: ${v}`);
      }
    }
    if (colorParts.length > 0) {
      sections.push("BRAND COLORS to apply:\n  " + colorParts.join("\n  "));
    }
  }

  const productBlocks: string[] = [];
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    productBlocks.push(
      `  [${i + 1}] ${product.name}\n` +
        `      Description: ${product.description}\n` +
        `      Ingredients: ${product.ingredients}\n` +
        `      Target Audience: ${product.target_audience}\n` +
        `      CTA: ${product.cta}`
    );
  }
  sections.push("PRODUCTS TO FEATURE:\n" + productBlocks.join("\n"));

  const refDetails: string[] = [];
  for (const [key, label] of [
    ["composition", "Composition"],
    ["lighting", "Lighting"],
    ["background", "Background"],
    ["color_palette", "Color Palette"],
    ["text_overlays", "Text Overlays"],
  ] as [string, string][]) {
    const val = referenceAnalysis[key];
    if (val) {
      refDetails.push(`  - ${label}: ${val}`);
    }
  }
  if (refDetails.length > 0) {
    sections.push("REFERENCE AD DETAILS:\n" + refDetails.join("\n"));
  }

  sections.push(
    "OUTPUT REQUIREMENTS:\n" +
      "  - Format: 4:5 aspect ratio (1080x1350px recommended)\n" +
      "  - Product should be the hero — clearly visible and appetizing\n" +
      "  - Brand logo should be present but not overwhelming\n" +
      "  - Tropical/lifestyle feel preferred\n" +
      "  - Ensure product(s) look like real packaged beverages\n" +
      "  - Apply the product image reference exactly as shown — label, bottle shape, and branding must match the product image\n" +
      "  - Blend the product into the scene: match its lighting, shadows, reflections, and surface texture to the rest of the ad so it looks photographed in place, not pasted\n" +
      "  - Do NOT add any website URL, domain, or .com text to the image"
  );

  return sections.join("\n\n");
}

// Distribute refs into carousels of 3-7 items each (round-robin)
function distributeIntoCarousels<T>(items: T[], minSize = 3, maxSize = 7): T[][] {
  const carousels: T[][] = [];
  let current: T[] = [];

  for (const item of items) {
    current.push(item);
    if (current.length >= minSize) {
      carousels.push(current);
      current = [];
    }
  }

  // If we have a partial group that's at least 3, add it; otherwise merge with previous
  if (current.length > 0) {
    if (current.length >= minSize || carousels.length === 0) {
      carousels.push(current);
    } else {
      // Merge partial group into the last carousel
      carousels[carousels.length - 1].push(...current);
    }
  }

  // Cap carousels at maxSize by splitting any that are too large
  const result: T[][] = [];
  for (const c of carousels) {
    if (c.length > maxSize) {
      for (let i = 0; i < c.length; i += maxSize) {
        const chunk = c.slice(i, i + maxSize);
        if (chunk.length >= minSize) {
          result.push(chunk);
        } else if (result.length > 0) {
          result[result.length - 1].push(...chunk);
        } else {
          result.push(chunk);
        }
      }
    } else {
      result.push(c);
    }
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { threshold } = body;

    const validThresholds = [5, 10, 20];
    if (!threshold || !validThresholds.includes(Number(threshold))) {
      return NextResponse.json(
        { error: "threshold must be 5, 10, or 20" },
        { status: 400 }
      );
    }

    const thresholdValue = Number(threshold);

    // Use service role for admin operations
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Fetch pending refs for this threshold
    const { data: refs, error: refsError } = await supabaseAdmin
      .from("reference_links")
      .select("*")
      .eq("batch_threshold", thresholdValue)
      .eq("status", "pending");

    if (refsError) {
      return NextResponse.json(
        { error: "Failed to fetch reference links" },
        { status: 500 }
      );
    }

    if (!refs || refs.length < thresholdValue) {
      return NextResponse.json(
        {
          error: `Not enough refs. Have ${refs?.length || 0}, need ${thresholdValue}`,
        },
        { status: 400 }
      );
    }

    // Take only the first `threshold` refs
    const selectedRefs = refs.slice(0, thresholdValue);

    // Distribute into carousels
    const carouselGroups = distributeIntoCarousels(selectedRefs, 3, 7);

    const brand = getDefaultBrand();
    const products = await getDefaultProducts();

    if (!products.length || !products[0].image_url) {
      return NextResponse.json(
        { error: "No product images available. Upload product images to Supabase Storage first." },
        { status: 400 }
      );
    }

    let carouselsCreated = 0;
    const errors: string[] = [];

    for (const group of carouselGroups) {
      // For each carousel, generate one ad per ref
      const adIds: string[] = [];

      for (const ref of group) {
        const resolvedUrl = ref.resolved_image_url || ref.url;

        // Analyze reference
        const analysisPrompt = buildReferenceAnalysisPrompt();
        const analysisResult = await analyzeWithGemini(resolvedUrl, analysisPrompt);

        if (!analysisResult.success || !analysisResult.analysis) {
          errors.push(`Analysis failed for ref ${ref.id}: ${analysisResult.error}`);
          continue;
        }

        const referenceAnalysis = parseReferenceAnalysis(analysisResult.analysis);
        const generationPrompt = buildGenerationPromptTS(referenceAnalysis, brand, products);

        // Generate ad
        const genResult = await generateWithGemini(
          resolvedUrl,
          products.map((p) => p.image_url),
          generationPrompt
        );

        if (!genResult.success || !genResult.imageBase64) {
          errors.push(`Generation failed for ref ${ref.id}: ${genResult.error}`);
          continue;
        }

        // Upload to Supabase Storage
        const adId = randomUUID();
        const filename = `batch_${adId}.jpg`;
        const storagePath = `batch/${filename}`;

        let outputImageUrl: string;
        try {
          outputImageUrl = await uploadToSupabaseStorage(
            genResult.imageBase64,
            "generated-ads",
            storagePath
          );
        } catch (e: any) {
          errors.push(`Upload failed for ref ${ref.id}: ${e.message}`);
          continue;
        }

        // Insert into generated_ads
        const { data: ad, error: adErr } = await supabaseAdmin
          .from("generated_ads")
          .insert({
            brand_id: ref.brand_id || brand.id,
            status: "draft",
            format: "4:5",
            platform: "instagram",
            output_image_url: outputImageUrl,
            prompt_used: generationPrompt,
            reference_analysis: referenceAnalysis,
            pinterest_title: ref.pinterest_title,
            pinterest_description: ref.pinterest_description,
          })
          .select()
          .single();

        if (adErr) {
          errors.push(`Failed to save ad for ref ${ref.id}: ${adErr.message}`);
          continue;
        }

        adIds.push(ad.id);

        // Update ref status to 'processed'
        await supabaseAdmin
          .from("reference_links")
          .update({ status: "processed" })
          .eq("id", ref.id);
      }

      // Create carousel record if we have any ads
      if (adIds.length > 0) {
        const { data: carousel, error: carouselErr } = await supabaseAdmin
          .from("carousels")
          .insert({
            brand_id: brand.id,
            status: "pending",
            thumbnail_url: outputImageUrl,
            threshold_used: thresholdValue,
          })
          .select()
          .single();

        if (carouselErr) {
          errors.push(`Failed to create carousel: ${carouselErr.message}`);
          continue;
        }

        // Create carousel_items
        for (let i = 0; i < adIds.length; i++) {
          await supabaseAdmin.from("carousel_items").insert({
            carousel_id: carousel.id,
            ad_id: adIds[i],
            position: i + 1,
          });
        }

        carouselsCreated++;
      }
    }

    return NextResponse.json({
      success: true,
      carouselsCreated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("POST /api/batch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
