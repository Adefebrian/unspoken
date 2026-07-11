import { test, expect } from "bun:test";
import { validateBody, hasProfanity, hasLink, isDuplicate } from "./guard.ts";

test("validateBody trims and rejects empty", () => {
  const ok = validateBody("  hello there  ");
  expect(ok).toEqual({ ok: true, value: "hello there" });
  expect(validateBody("   ").ok).toBe(false);
  expect(validateBody(42 as unknown).ok).toBe(false);
});

test("validateBody rejects absurdly long input", () => {
  expect(validateBody("x".repeat(25000)).ok).toBe(false);
});

test("hasProfanity catches slurs but not clean substrings", () => {
  expect(hasProfanity("you are anjing")).toBe(true);
  expect(hasProfanity("class and grass are fine")).toBe(false);
  expect(hasProfanity("assessment of the classics")).toBe(false);
});

test("hasLink blocks urls and bare domains, allows plain text", () => {
  expect(hasLink("check spam.com now")).toBe(true);
  expect(hasLink("http://x.io/promo")).toBe(true);
  expect(hasLink("www.thing.net")).toBe(true);
  expect(hasLink("i still miss you every day")).toBe(false);
});

test("isDuplicate blocks a normalized repeat within the window", () => {
  const body = "a one-of-a-kind confession " + Date.now();
  expect(isDuplicate(body)).toBe(false);
  expect(isDuplicate(body)).toBe(true);
  expect(isDuplicate("  " + body.toUpperCase() + "  ")).toBe(true);
});
