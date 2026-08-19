import assert from "node:assert/strict";
import test from "node:test";
import {
  GLOBAL_ERROR_RETRY_WINDOW_MS,
  globalErrorRecoveryRecord,
  isProtectedApplicationPath,
  shouldFallbackAfterGlobalError,
} from "../../lib/navigation-recovery";

test("protected application path detection covers every authenticated HOAHub shell", () => {
  for (const pathname of [
    "/admin/dashboard",
    "/platform/tenants",
    "/portal/dashboard",
    "/employee/attendance",
  ]) assert.equal(isProtectedApplicationPath(pathname), true, pathname);

  for (const pathname of ["/", "/login", "/tamara/login", "/forgot-password", "/complaints/track"]) {
    assert.equal(isProtectedApplicationPath(pathname), false, pathname);
  }
});

test("global error recovery falls back only for an immediate repeat on the same route", () => {
  const now = 1_800_000_000_000;
  const record = globalErrorRecoveryRecord("/admin/dashboard", now);

  assert.equal(shouldFallbackAfterGlobalError(record, "/admin/dashboard", now + 1_000), true);
  assert.equal(shouldFallbackAfterGlobalError(record, "/platform/dashboard", now + 1_000), false);
  assert.equal(shouldFallbackAfterGlobalError(record, "/admin/dashboard", now + GLOBAL_ERROR_RETRY_WINDOW_MS + 1), false);
  assert.equal(shouldFallbackAfterGlobalError("not-json", "/admin/dashboard", now + 1_000), false);
});
