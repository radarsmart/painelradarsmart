import type { Metadata } from "next";
import { AwinMasterTag } from "@/components/awin/AwinMasterTag";
import { BottomNav } from "@/components/navigation/BottomNav";
import { InstallPrompt } from "@/components/navigation/InstallPrompt";
import "./globals.css";

const SITE_URL = "https://radarsmart.com.br";
const SITE_NAME = "Radar Smart";
const SITE_TITLE = "Radar Smart - Melhores Ofertas do Brasil";
const SITE_DESCRIPTION =
  "Curadoria inteligente das melhores ofertas de eletrônicos, casa, beleza e muito mais. Economize com o Radar Smart.";
const SITE_LOGO_PATH = "/logo-radar-smart.png";
const SITE_OG_IMAGE_PATH = "/og-image.jpg";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192x192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512x512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: SITE_TITLE,
    description: "As melhores ofertas curadas para você",
    url: SITE_URL,
    siteName: SITE_NAME,
    images: [
      {
        url: SITE_OG_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: "Radar Smart - Melhores Ofertas",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: "As melhores ofertas curadas para você",
    images: [SITE_OG_IMAGE_PATH],
  },
  other: {
    "google-site-verification": "se_houver_pode_colocar_aqui",
    lomadee: "2324685",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const logoUrl = `${SITE_URL}${SITE_LOGO_PATH}`;
  const ogImageUrl = `${SITE_URL}${SITE_OG_IMAGE_PATH}`;
  const schemaGraph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        alternateName: ["RadarSmart", "RS Ofertas", "Radar Smart Ofertas"],
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        inLanguage: "pt-BR",
        publisher: {
          "@id": `${SITE_URL}/#organization`,
        },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}/buscar?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: {
          "@type": "ImageObject",
          url: logoUrl,
          contentUrl: logoUrl,
          width: 1024,
          height: 1024,
        },
        image: logoUrl,
        description: SITE_DESCRIPTION,
        sameAs: [
          "https://www.instagram.com/radarsmart",
          "https://t.me/radarsmart",
        ],
      },
      {
        "@type": "ImageObject",
        "@id": `${SITE_URL}/#og-image`,
        url: ogImageUrl,
        contentUrl: ogImageUrl,
        width: 1200,
        height: 630,
        caption: SITE_TITLE,
      },
    ],
  };

  return (
    <html lang="pt-BR">
      <body className="bg-slate-50 font-body text-navy antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaGraph) }}
        />
        {children}
        <InstallPrompt />
        <BottomNav />
        <AwinMasterTag />
      </body>
    </html>
  );
}
