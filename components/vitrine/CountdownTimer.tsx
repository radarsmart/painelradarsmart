"use client";

import { useEffect, useMemo, useState } from "react";

type CountdownTimerProps = {
  endAt: string;
  renewWindowMs?: number;
};

const DEFAULT_RENEW_WINDOW_MS = 48 * 60 * 60 * 1000;

export default function CountdownTimer({
  endAt,
  renewWindowMs = DEFAULT_RENEW_WINDOW_MS,
}: CountdownTimerProps) {
  const initialTarget = useMemo(() => new Date(endAt).getTime(), [endAt]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const target = useMemo(() => {
    if (!Number.isFinite(initialTarget) || renewWindowMs <= 0) return initialTarget;
    if (initialTarget > now) return initialTarget;

    const elapsed = now - initialTarget;
    const cycles = Math.floor(elapsed / renewWindowMs) + 1;
    return initialTarget + cycles * renewWindowMs;
  }, [initialTarget, now, renewWindowMs]);

  const diff = Math.max(0, target - now);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return (
    <span className="rounded-md bg-rs-red px-2 py-1 font-mono text-xs text-white">
      {hours.toString().padStart(2, "0")}:
      {minutes.toString().padStart(2, "0")}:
      {seconds.toString().padStart(2, "0")}
    </span>
  );
}
