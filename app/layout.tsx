import type { Metadata } from "next";
import { AwinMasterTag } from "@/components/awin/AwinMasterTag";
import { BottomNav } from "@/components/navigation/BottomNav";
import { InstallPrompt } from "@/components/navigation/InstallPrompt";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar Smart",
  description: "Radar Smart · inteligencia em ofertas afiliadas",
  manifest: "/manifest.json",
  other: {
    lomadee: "2324685",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-50 font-body text-navy antialiased">
        {children}
        <InstallPrompt />
        <BottomNav />
        <AwinMasterTag />
      </body>
    </html>
  );
}
