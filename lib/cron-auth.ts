import { timingSafeEqual } from "node:crypto";

export function authorizeCron(request: Request) {
  const expected = process.env.CRON_SECRET?.trim() || "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}
