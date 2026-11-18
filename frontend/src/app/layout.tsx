import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { primerMetadata } from "./primer-metadata";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Canonical production origin. Override with NEXT_PUBLIC_SITE_URL if the domain changes.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.bioaiflow.ir").replace(/\/$/, "");

const base = primerMetadata;

export const metadata: Metadata = {
  ...base,
  // Makes every relative URL (og:image, canonical, ...) resolve on the real domain,
  // not on the *.vercel.app deployment URL.
  metadataBase: new URL(SITE_URL),
  alternates: { ...base.alternates, canonical: "/" },
  openGraph: { ...base.openGraph, url: SITE_URL },
  // Use the same preview image for Twitter/X as for Open Graph.
  twitter: {
    ...base.twitter,
    ...(base.openGraph?.images
      ? { images: base.openGraph.images as NonNullable<Metadata["twitter"]>["images"] }
      : {}),
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Primer AI",
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  description:
    "Molecular biology workbench and services: primer design, RT-qPCR analysis, CRISPR gRNA, Gibson assembly, bioinformatics and drug-research data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
        {children}
      </body>
    </html>
  );
}
