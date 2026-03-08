"use client";

import { useEffect, useMemo, useState } from "react";

type CountdownTimerProps = {
  endAt: string;
};

export default function CountdownTimer({ endAt }: CountdownTimerProps) {
  const target = useMemo(() => new Date(endAt).getTime(), [endAt]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

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
