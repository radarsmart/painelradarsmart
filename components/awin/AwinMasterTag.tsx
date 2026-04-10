"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

export function AwinMasterTag() {
  const pathname = usePathname();

  if (pathname?.startsWith("/admin")) {
    return null;
  }

  return <Script src="https://www.dwin2.com/pub.2843910.min.js" strategy="afterInteractive" />;
}
