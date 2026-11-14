import type { Metadata } from "next";

// Set NEXT_PUBLIC_SITE_URL to the final HTTPS domain in Vercel before deployment.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://primer-ai-nu.vercel.app";
const description = "Primer AI is a molecular biology and bioinformatics workbench for primer design, qPCR analysis, protein exploration, and pharmaceutical research.";

export const primerMetadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Primer AI | Molecular Biology & Drug Research",
  description,
  icons: { icon: [{ url: "/primer-icon.svg", type: "image/svg+xml" }] },
  openGraph: {
    type: "website",
    title: "Primer AI | Molecular Biology & Drug Research",
    description,
    siteName: "Primer AI",
    images: [{ url: "/primer-og.png", width: 1200, height: 630, alt: "Primer AI molecular biology and pharmaceutical research workbench" }],
  },
  twitter: { card: "summary_large_image", title: "Primer AI | Molecular Biology & Drug Research", description, images: ["/primer-og.png"] },
};
