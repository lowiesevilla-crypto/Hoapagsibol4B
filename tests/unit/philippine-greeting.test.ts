import assert from "node:assert/strict";
import test from "node:test";
import { philippineGreeting, philippineHour } from "@/lib/philippine-greeting";

test("Philippines greeting uses Asia/Manila time instead of server UTC", () => {
  assert.equal(philippineHour(new Date("2026-08-20T02:00:00.000Z")), 10);
  assert.equal(philippineGreeting(new Date("2026-08-20T02:00:00.000Z")), "Good morning");
});

test("Philippines greeting switches to afternoon at 12:00 PHT", () => {
  assert.equal(philippineGreeting(new Date("2026-08-20T03:59:00.000Z")), "Good morning");
  assert.equal(philippineGreeting(new Date("2026-08-20T04:00:00.000Z")), "Good afternoon");
});

test("Philippines greeting switches to evening at 18:00 PHT", () => {
  assert.equal(philippineGreeting(new Date("2026-08-20T09:59:00.000Z")), "Good afternoon");
  assert.equal(philippineGreeting(new Date("2026-08-20T10:00:00.000Z")), "Good evening");
});

test("Philippines greeting keeps overnight hours as evening until 05:00 PHT", () => {
  assert.equal(philippineGreeting(new Date("2026-08-20T20:59:00.000Z")), "Good evening");
  assert.equal(philippineGreeting(new Date("2026-08-20T21:00:00.000Z")), "Good morning");
});
