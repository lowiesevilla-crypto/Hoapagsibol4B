export const MANILA_TIME_ZONE = "Asia/Manila";

export type ManilaClock = {
  year: number;
  month: number;
  day: number;
};

/**
 * Resolve a timestamp to the HOAHub business calendar in Asia/Manila.
 *
 * Billing periods and scheduled billing days are calendar concepts, so they
 * must not depend on the Node.js process timezone or UTC date boundaries.
 */
export function getManilaClock(value: Date = new Date()): ManilaClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const getPart = (type: "year" | "month" | "day") => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const clock = { year: getPart("year"), month: getPart("month"), day: getPart("day") };

  if (!clock.year || clock.month < 1 || clock.month > 12 || clock.day < 1 || clock.day > 31) {
    throw new Error("Unable to resolve Asia/Manila business date.");
  }

  return clock;
}
