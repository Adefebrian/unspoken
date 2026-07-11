import { test, expect } from "bun:test";
import { createLimiter } from "./limiter.ts";

test("allows up to max, then blocks; keys are independent", () => {
  const l = createLimiter(3, 60_000);
  expect(l.hit("a")).toBe(true);
  expect(l.hit("a")).toBe(true);
  expect(l.hit("a")).toBe(true);
  expect(l.hit("a")).toBe(false);
  expect(l.over("a")).toBe(true);
  // a different key has its own budget
  expect(l.hit("b")).toBe(true);
  expect(l.over("b")).toBe(false);
});
