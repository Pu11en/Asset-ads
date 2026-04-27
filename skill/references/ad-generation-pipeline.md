# Ad Generation — How to Write the Prompt

This is how YOU write the image-generation prompt for each ad. You are the art director. The script just runs the generation — you write the actual prompt using this framework.

## The Core Problem We're Solving

The ad should look like the reference ad's composition and mood, but with the Island Splash product swapped in. The product must look like it **belongs** in the scene — same lighting, same shadows, same texture quality. NOT like a stock photo pasted in.

## When to Generate

User says "generate ads" or "island splash" or "make me an ad."

## What You're Given

- **Reference image** — the ad we're re-branding
- **Product label image** — our bottle with label
- **Brand identity** — Island Splash colors, voice, rules
- **Health benefits** — per-product facts to weave into text if reference has health claims

## The Prompt Framework

Write the prompt in 5 PHASES. Each phase builds on the last:

---

### PHASE 1 — REFERENCE ANALYSIS (do this first)

Look at the reference image and extract:

**FORBIDDEN IN OUTPUT** (list first, be exhaustive):
- Every text string visible (headlines, taglines, fine print, labels)
- Every logo, wordmark, brand name
- Every decorative badge, ribbon, shape, watermark
- Every illustration/icon on the product
- Any URL, phone number, social handle
- The reference brand name and any competitor brand names

Example:
```
FORBIDDEN IN OUTPUT:
- "YOUR DAILY DOSE OF" (headline, white sans-serif)
- "VITAMIN C" (on golden ribbon)
- "Premium PRODUCT" and "FRUITS UP" (bottle label)
- "SIAL Interfood Jakarta" event badge
- Any green cloud-shaped badge with leaves
- The reference brand's logo (three teardrop shapes)
- Any decorative orange wave at bottom
```

**THEN** write the rest of the prompt using these phases:

---

### PHASE 2 — SUBJECT & COMPOSITION

Keep the reference's subject exactly. Write what you see — don't invent:
- What's the main subject? (person, bottle, scene?)
- What's the camera angle and framing?
- What's in the background?
- What surface does the product sit on?

```
SUBJECT & COMPOSITION:
A single clear plastic beverage bottle standing upright on a weathered wooden tabletop. 
Shot from eye level, slightly above, three-quarter angle. 
Background is a soft-focus sunlit orange grove with shallow depth of field.
```

---

### PHASE 3 — PRODUCT INTEGRATION (most important phase)

This is where we solve the "pasted-in" problem. Be explicit:

**Label**: Paste the provided product label PIXEL-FAITHFUL onto the container. Do NOT redraw or alter the label design. The label IS the label from the input image.

**Container**: The bottle shape comes from the reference's product. Clear plastic. 

**Cap**: ALWAYS matte black cap — never inherit cap color from the reference.

**Lighting match**: The product must catch the same light as the scene. Describe the scene lighting then tie the product to it:
- "The product catches highlights matching the scene's warm overhead sun"
- "Soft diffused shadows under the product, consistent with the scene's light direction"
- "No highlight on the product that contradicts the scene's rim light"

**Shadow**: The product casts a natural shadow on the scene surface:
- "Soft, diffuse shadow under the bottle, grounded on the wooden surface"

```
PRODUCT PLACEMENT:
The bottle sits center-frame on the wooden table, matching the reference's 
position. Paste the Island Splash label pixel-faithful — do not redraw. 
Matte black cap. The bottle catches warm highlights matching the scene's 
overhead sun. A soft shadow grounds it on the wooden surface.
```

---

### PHASE 4 — TEXT STRATEGY

Only if the reference has text. Match the reference's font feel:
- Sans-serif headline → clean sans-serif
- Serif tagline → elegant serif
- Colors from brand palette only

Write text in brand voice: plain, honest, no spa-fluff.

If reference has NO text, keep the ad minimal — no text unless it serves the brand.

**Brand palette** (Island Splash):
- Dark teal: #243C3C
- Warm golden orange: #F0A86C
- Deep coral orange: #E4843C
- Warm sand/tan: #A89078

---

### PHASE 5 — STYLE OVERLAY (final unifying pass)

Take the reference's visual treatment and apply it to our scene. This is the color grade + lighting treatment that makes everything feel cohesive:

```
STYLE OVERLAY:
Shot with a high-resolution full-frame digital camera and a sharp prime lens 
at very wide aperture (shallow depth of field). Bright, high-key lighting 
mimicking warm overhead sun with soft, diffuse shadows. 

Color grade: shift ALL colors to Island Splash palette — deep teal (#243C3C), 
warm golden orange (#F0A86C), deep coral (#E4843C), warm sand (#A89078). 
The background grove shifts to teal-green tones. 

Commercial S-curve boost in mid-tones. Soft-focus bokeh in background. 
Clean, noise-free, hyper-realistic finish.

This style overlay is applied as the final unifying pass over the entire image.
```

---

## What NOT to Do

1. **Don't add produce/ingredients from the reference** — those are the reference brand's ingredients. Only the product transfers.
2. **Don't describe the reference's brand colors as if they're ours** — always shift to brand palette.
3. **Don't say "keep the product's original lighting"** — that's vague. Say "matches the scene's warm overhead sun with soft diffuse shadows."
4. **Don't paste the label generically** — be specific: "pixel-faithful paste onto the bottle's front surface, matching the container's curvature."
5. **Don't add text the reference didn't have** — if no headline in ref, don't invent one unless it serves the brand.

## Output Format

Always write the prompt as plain text with these headers in order:

```
FORBIDDEN IN OUTPUT:
(list all reference brand elements — text, logos, badges, decorative elements)

STRICT CONSTRAINTS:
- Aspect ratio: 4:5 (Instagram portrait)
- Label from input image — pixel-faithful paste, no redraw
- Matte black cap — never from reference
- No mascots, cartoon characters, personified objects
- Brand palette only: #243C3C, #F0A86C, #E4843C, #A89078
- No hashtags, URLs, pricing, phone numbers, social handles

SUBJECT & COMPOSITION:
(what to keep from reference — exact subject, camera angle, framing, background)

PRODUCT INTEGRATION:
(exact placement, label paste instruction, lighting match, shadow, cap)

TEXT STRATEGY:
(headline matching brand voice, font feel from reference, brand palette colors)

STYLE OVERLAY:
(lighting, color grade with brand palette, lens feel, bokeh, final unifying instruction)
```

## Image Generation

After writing the prompt:
1. Read the reference image
2. Read the product label image
3. Call the image generation tool with both images and the prompt
4. Model to use: `gpt-image-2-medium` (from ads-agent config)
5. Aspect ratio: 4:5

## Success Criteria

The generated ad passes if:
- Product label is readable and intact
- Product lighting matches the scene
- Product casts a natural shadow
- Brand colors dominate
- Reference's compositional structure is preserved
- No reference brand text/logos visible
