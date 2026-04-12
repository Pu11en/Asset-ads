import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Island Splash — Asset Ads",
  description: "Generated ad content for Island Splash Caribbean tropical drinks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground min-h-screen">{children}</body>
    </html>
  );
}
