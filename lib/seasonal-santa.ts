export const SEASONAL_SANTA_SESSION_KEY = "hoahub.seasonal-santa.shown.v1";
export const SEASONAL_SANTA_LOGIN_KEY = "hoahub.seasonal-santa.login.v1";

/** True for September 1 through December 31 in the visitor's local calendar year. */
export function isSeasonalSantaWindow(date: Date): boolean {
  const month = date.getMonth();
  return month >= 8 && month <= 11;
}

export function seasonalSantaSessionKey(tenantId: string) {
  // The tenant id is part of the session key so switching an authenticated HOA account
  // can never reuse another association's greeting state.
  return `${SEASONAL_SANTA_SESSION_KEY}:${tenantId}`;
}

export function wasSeasonalSantaShownForLogin(storedValue: string | null, loginAt: number): boolean {
  return storedValue === String(loginAt);
}
