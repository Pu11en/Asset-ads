"use client";

import { useState } from "react";

const PRODUCTS = [
  { name: "Mango Passion", file: "upgraded_MangoPassion.png" },
  { name: "Mauby", file: "upgraded_Mauby.png" },
  { name: "Peanut Punch", file: "upgraded_peanutpunch.png" },
  { name: "Lime", file: "upgraded_Lime.png" },
  { name: "Guava Pine", file: "upgraded_GuavaPine.png" },
  { name: "Sorrel", file: "upgraded_sorrel.png" },
  { name: "Pine Ginger", file: "upgraded_pineginger.png" },
];

export default function ProductsPage() {
  const [message, setMessage] = useState<string | null>(null);

  const handleReplace = async (productName: string, filename: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("product", productName);

      const res = await fetch("/api/products/replace", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setMessage(data.success ? `✅ ${productName} replaced!` : `❌ Error: ${data.error}`);
      setTimeout(() => setMessage(null), 3000);
      if (data.success) window.location.reload();
    };
    input.click();
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Product Images</h1>
      <p className="mb-6 text-gray-600">
        Double-click any product to replace its image. These are used for ad generation.
      </p>

      {message && (
        <div className="mb-6 p-4 bg-blue-100 text-blue-800 rounded">
          {message}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {PRODUCTS.map((product) => (
          <div
            key={product.name}
            className="border-2 border-gray-200 rounded-lg p-4 cursor-pointer hover:border-gray-400 transition"
            onDoubleClick={() => handleReplace(product.name, product.file)}
          >
            <img
              src={`/images/products/${product.file}`}
              alt={product.name}
              className="w-full h-48 object-contain mb-2"
            />
            <p className="font-semibold text-center">{product.name}</p>
            <p className="text-xs text-gray-500 text-center mt-1">
              Double-click to replace
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
