export const PHILIPPINE_TIME_ZONE = "Asia/Manila";

export type PhilippineGreeting = "Good morning" | "Good afternoon" | "Good evening";

export function philippineHour(date = new Date()) {
  const hourPart = new Intl.DateTimeFormat("en-US", {
    timeZone: PHILIPPINE_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).find((part) => part.type === "hour")?.value;

  const hour = Number(hourPart);
  return Number.isFinite(hour) ? hour : 0;
}

export function philippineGreeting(date = new Date()): PhilippineGreeting {
  const hour = philippineHour(date);
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}
