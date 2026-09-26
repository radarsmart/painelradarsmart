"use client";

import { useEffect, useRef } from "react";

type OfferImpressionTrackerProps = {
  offerId: string;
  source: string;
  channel?: string;
};

export default function OfferImpressionTracker({
  offerId,
  source,
  channel = "site",
}: OfferImpressionTrackerProps) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    const safeOfferId = String(offerId ?? "").trim();
    if (!element || !safeOfferId || safeOfferId === "unknown") return;

    let sent = false;
    const send = () => {
      if (sent) return;
      sent = true;
      const payload = JSON.stringify({
        offer_id: safeOfferId,
        event_type: "impression",
        source,
        channel,
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/analytics/events", new Blob([payload], { type: "application/json" }));
        return;
      }

      void fetch("/api/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      });
    };

    if (!("IntersectionObserver" in window)) {
      send();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.35)) {
          send();
          observer.disconnect();
        }
      },
      { threshold: [0.35] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [channel, offerId, source]);

  return <span ref={ref} className="sr-only" aria-hidden="true" />;
}
