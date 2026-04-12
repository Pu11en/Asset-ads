import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent";

// Pinterest URL resolution
async function resolvePinterestUrl(url: string): Promise<{
  resolvedUrl: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
}> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  const html = await response.text();
  const resolvedUrl = response.url;

  // Extract og:title
  let title: string | null = null;
  const titleMatch = html.match(
    /<meta[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["']/i
  );
  if (titleMatch) {
    title = titleMatch[1];
  } else {
    const titleMatch2 = html.match(
      /<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:title["']/i
    );
    if (titleMatch2) title = titleMatch2[1];
  }
  if (!title) {
    const htmlTitleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (htmlTitleMatch) title = htmlTitleMatch[1];
  }

  // Extract og:description
  let description: string | null = null;
  const descMatch = html.match(
    /<meta[^>]*(?:property|name)=["']og:description["'][^>]*content=["']([^"']+)["']/i
  );
  if (descMatch) {
    description = descMatch[1];
  } else {
    const descMatch2 = html.match(
      /<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:description["']/i
    );
    if (descMatch2) description = descMatch2[1];
  }

  // Extract og:image
  let imageUrl: string | null = null;
  const imageMatch = html.match(
    /<meta[^>]*(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["']/i
  );
  if (imageMatch) {
    imageUrl = imageMatch[1];
  } else {
    const imageMatch2 = html.match(
      /<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/i
    );
    if (imageMatch2) imageUrl = imageMatch2[1];
  }

  return { resolvedUrl, title, description, imageUrl };
}

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

// Parse reference analysis text into structured dict
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
      if (prefix.includes(trimmed.substring(0, Math.min(trimmed.length, 20)).toUpperCase()) ||
          trimmed.toUpperCase().includes(prefix)) {
        if (trimmed.toUpperCase().startsWith(prefix) ||
            (trimmed.includes(":") && headerMarkers.some(([p]) => trimmed.toUpperCase().startsWith(p)))) {
          saveSection();
          currentSection = key;
          sectionContent = [];
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      sectionContent.push(trimmed);
    }
  }
  saveSection();

  // Parse list fields
  for (const key of ["preserve_elements", "replace_elements", "adapt_elements"]) {
    if (typeof result[key] === "string") {
      const items = result[key]
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

// Call Gemini API for image analysis
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
    // Fetch the image
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

// Call Gemini API for image generation
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
    // Fetch reference image
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

    // Add product images
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

// Upload generated image to Supabase Storage
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

// Get default brand data (hardcoded for now)
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, brand_id } = body;

    // Validate URL
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    try {
      const parsedUrl = new URL(url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return NextResponse.json(
          { error: "url must be http or https" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json({ error: "url is not a valid URL" }, { status: 400 });
    }

    const resolved = await resolvePinterestUrl(url);

    if (!resolved.imageUrl) {
      return NextResponse.json(
        { error: "Could not extract image from Pinterest URL" },
        { status: 400 }
      );
    }

    // Step 1: Analyze the reference image
    const analysisPrompt = buildReferenceAnalysisPrompt();
    const analysisResult = await analyzeWithGemini(resolved.imageUrl, analysisPrompt);

    if (!analysisResult.success || !analysisResult.analysis) {
      return NextResponse.json(
        { error: `Reference analysis failed: ${analysisResult.error}` },
        { status: 502 }
      );
    }

    const referenceAnalysis = parseReferenceAnalysis(analysisResult.analysis);

    // Step 2: Get brand and products (using defaults for now)
    const brand = getDefaultBrand();
    const products = await getDefaultProducts(brand_id);

    if (!products.length || !products[0].image_url) {
      return NextResponse.json(
        { error: "No product images available. Upload product images to Supabase Storage first." },
        { status: 400 }
      );
    }

    // Step 3: Build generation prompt
    const generationPrompt = buildGenerationPromptTS(referenceAnalysis, brand, products);

    // Step 4: Generate the ad image
    const genResult = await generateWithGemini(
      resolved.imageUrl,
      products.map((p) => p.image_url),
      generationPrompt
    );

    if (!genResult.success || !genResult.imageBase64) {
      return NextResponse.json(
        { error: `Image generation failed: ${genResult.error}` },
        { status: 502 }
      );
    }

    // Step 5: Upload to Supabase Storage
    const adId = randomUUID();
    const filename = `generated_${adId}.jpg`;
    const storagePath = `instant/${filename}`;

    let outputImageUrl: string;
    try {
      outputImageUrl = await uploadToSupabaseStorage(
        genResult.imageBase64,
        "generated-ads",
        storagePath
      );
    } catch (e: any) {
      return NextResponse.json(
        { error: `Upload failed: ${e.message}` },
        { status: 502 }
      );
    }

    // Step 6: Insert into generated_ads
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const { data: ad, error: adErr } = await supabase
      .from("generated_ads")
      .insert({
        brand_id: brand_id || brand.id,
        status: "draft",
        format: "4:5",
        platform: "instagram",
        output_image_url: outputImageUrl,
        prompt_used: generationPrompt,
        reference_analysis: referenceAnalysis,
        pinterest_title: resolved.title,
        pinterest_description: resolved.description,
      })
      .select()
      .single();

    if (adErr) {
      console.error("Failed to save ad:", adErr);
      return NextResponse.json(
        { error: "Failed to save generated ad" },
        { status: 500 }
      );
    }

    // Step 7: Create carousel and carousel_item for the generated ad
    const carouselId = randomUUID();
    const { error: carouselErr } = await supabase
      .from("carousels")
      .insert({
        id: carouselId,
        brand_id: brand_id || brand.id,
        status: "pending",
        thumbnail_url: outputImageUrl,
        threshold_used: 1,
      });

    if (carouselErr) {
      console.error("Failed to create carousel:", carouselErr);
      return NextResponse.json(
        { error: "Failed to create carousel" },
        { status: 500 }
      );
    }

    const { error: carouselItemErr } = await supabase
      .from("carousel_items")
      .insert({
        carousel_id: carouselId,
        ad_id: ad.id,
        position: 1,
      });

    if (carouselItemErr) {
      console.error("Failed to create carousel item:", carouselItemErr);
      return NextResponse.json(
        { error: "Failed to create carousel item" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      adId: ad.id,
      imageUrl: outputImageUrl,
      carousel_id: carouselId,
    });
  } catch (err) {
    console.error("POST /api/instant error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Build generation prompt in TypeScript (same logic as prompt_builder.py)
function buildGenerationPromptTS(
  referenceAnalysis: Record<string, unknown>,
  brand: { name: string; flavor_profile: string; health_claims: string; brand_analysis: { colors: Record<string, string>; brand_feel: string } },
  products: Array<{ name: string; description: string; ingredients: string; image_url: string; target_audience: string; cta: string }>
): string {
  const sections: string[] = [];

  // AD TYPE & STYLE
  const adType = (referenceAnalysis.ad_type as string) || "lifestyle beverage ad";
  const productNames = products.map((p) => p.name).join(", ");
  sections.push(
    `AD TYPE: Transform this reference ${adType} into a new ad for ${brand.name} featuring: ${productNames}.`
  );

  // PRESERVE
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

  // REPLACE
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

  // ADAPT
  const adapt = (referenceAnalysis.adapt_elements as string[]) || [
    "Color treatment → map to brand's tropical color palette (teal, orange, golden)",
    "Props → use the brand's ingredient cues (fruits, leaves, natural elements)",
    "Product reflections/shine → match the target product's material (glass/plastic)",
    "Spacing and framing → flex to fit the new product's packaging shape",
  ];
  sections.push(
    "ADAPT intelligently:\n" + adapt.map((a) => `  - ${a}`).join("\n")
  );

  // BRAND CONTEXT
  sections.push(
    "BRAND CONTEXT:\n" +
      `  - Brand: ${brand.name}\n` +
      `  - Flavor Profile: ${brand.flavor_profile}\n` +
      `  - Health Claims: ${brand.health_claims}\n` +
      `  - Brand Feel: ${brand.brand_analysis.brand_feel}`
  );

  // BRAND COLORS
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

  // PRODUCT INFO
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

  // REFERENCE ANALYSIS DETAILS
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

  // OUTPUT REQUIREMENTS
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
