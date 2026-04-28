import { NextRequest, NextResponse } from "next/server";
import { writeFileSync } from "fs";
import path from "path";

const PRODUCTS_DIR = "/home/drewp/splash-website/assets/products";

const PRODUCT_FILES: Record<string, string> = {
  "Mango Passion": "upgraded_MangoPassion.png",
  "Mauby": "upgraded_Mauby.png",
  "Peanut Punch": "upgraded_peanutpunch.png",
  "Lime": "upgraded_Lime.png",
  "Guava Pine": "upgraded_GuavaPine.png",
  "Sorrel": "upgraded_sorrel.png",
  "Pine Ginger": "upgraded_pineginger.png",
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const product = formData.get("product") as string;

    if (!file || !product) {
      return NextResponse.json({ error: "Missing file or product" }, { status: 400 });
    }

    const filename = PRODUCT_FILES[product];
    if (!filename) {
      return NextResponse.json({ error: "Unknown product" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const destPath = path.join(PRODUCTS_DIR, filename);
    writeFileSync(destPath, buffer);

    return NextResponse.json({ success: true, path: destPath });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
