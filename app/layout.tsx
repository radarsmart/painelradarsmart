import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar Smart",
  description: "Radar Smart · inteligência em ofertas afiliadas",
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
      </body>
    </html>
  );
}
