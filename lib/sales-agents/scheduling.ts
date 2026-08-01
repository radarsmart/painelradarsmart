import type { SalesAgent } from "./types";

function getLocalHour(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    return Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  } catch {
    return date.getUTCHours();
  }
}

export function isWithinSendWindow(agent: SalesAgent, now: Date = new Date()): boolean {
  const hour = getLocalHour(now, agent.timezone);

  if (agent.sendWindowStartHour <= agent.sendWindowEndHour) {
    return hour >= agent.sendWindowStartHour && hour < agent.sendWindowEndHour;
  }

  // Janela que cruza a meia-noite (ex.: 22 -> 6).
  return hour >= agent.sendWindowStartHour || hour < agent.sendWindowEndHour;
}

export function hasMinIntervalElapsed(agent: SalesAgent, now: Date = new Date()): boolean {
  if (!agent.lastRunAt) return true;

  const last = new Date(agent.lastRunAt).getTime();
  if (!Number.isFinite(last)) return true;

  const elapsedMinutes = (now.getTime() - last) / 60000;
  return elapsedMinutes >= agent.minIntervalMinutes;
}

export function isAgentEligibleNow(agent: SalesAgent, now: Date = new Date()): boolean {
  return agent.active && isWithinSendWindow(agent, now) && hasMinIntervalElapsed(agent, now);
}
