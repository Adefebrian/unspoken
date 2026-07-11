import { test, expect } from "bun:test";
import { isCrisis } from "./crisis.ts";

test("detects crisis language (English)", () => {
  expect(isCrisis("i want to die")).toBe(true);
  expect(isCrisis("i keep thinking about killing myself")).toBe(true);
  expect(isCrisis("there is no reason to live")).toBe(true);
  expect(isCrisis("i can't go on anymore")).toBe(true);
});

test("detects crisis language (Indonesian)", () => {
  expect(isCrisis("aku pengen mati aja")).toBe(true);
  expect(isCrisis("kepikiran bunuh diri terus")).toBe(true);
  expect(isCrisis("capek hidup rasanya")).toBe(true);
});

test("does not flag ordinary heavy-but-safe confessions", () => {
  expect(isCrisis("i still miss my ex so much it hurts")).toBe(false);
  expect(isCrisis("i got the job, the first person i wanted to call was you")).toBe(false);
  expect(isCrisis("aku kangen banget sama dia")).toBe(false);
});
