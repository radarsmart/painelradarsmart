import type { SalesAgent } from "./types";

function getLocalMinutesOfDay(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    return hour * 60 + minute;
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

export function isWithinSendWindow(agent: SalesAgent, now: Date = new Date()): boolean {
  const minutesOfDay = getLocalMinutesOfDay(now, agent.timezone);
  const startMinutes = agent.sendWindowStartHour * 60 + agent.sendWindowStartMinute;
  const endMinutes = agent.sendWindowEndHour * 60 + agent.sendWindowEndMinute;

  if (startMinutes <= endMinutes) {
    return minutesOfDay >= startMinutes && minutesOfDay < endMinutes;
  }

  // Janela que cruza a meia-noite (ex.: 22:00 -> 06:00).
  return minutesOfDay >= startMinutes || minutesOfDay < endMinutes;
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
