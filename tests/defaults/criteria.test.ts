import { describe, it, expect } from "vitest";
import { DEFAULT_CRITERIA } from "../../src/defaults/criteria.js";

describe("DEFAULT_CRITERIA", () => {
  it("is a non-empty string", () => {
    expect(typeof DEFAULT_CRITERIA).toBe("string");
    expect(DEFAULT_CRITERIA.length).toBeGreaterThan(0);
  });

  it("contains correctness criteria", () => {
    expect(DEFAULT_CRITERIA).toContain("Correctness");
    expect(DEFAULT_CRITERIA).toContain("implemented and functional");
  });

  it("contains testing criteria", () => {
    expect(DEFAULT_CRITERIA).toContain("Testing");
    expect(DEFAULT_CRITERIA).toContain("tests pass");
  });

  it("contains code quality criteria", () => {
    expect(DEFAULT_CRITERIA).toContain("Code Quality");
  });

  it("contains integration criteria", () => {
    expect(DEFAULT_CRITERIA).toContain("Integration");
  });
});
