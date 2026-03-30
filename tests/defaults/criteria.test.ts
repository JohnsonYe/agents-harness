import { describe, it, expect } from "vitest";
import { DEFAULT_CRITERIA, getDimensions, formatDimensionsBlock } from "../../src/defaults/criteria.js";

describe("DEFAULT_CRITERIA (backward compat)", () => {
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

describe("getDimensions", () => {
  it("returns 6 universal dimensions", () => {
    const dims = getDimensions("universal");
    expect(dims).toHaveLength(6);
    const names = dims.map(d => d.name);
    expect(names).toContain("Correctness");
    expect(names).toContain("Testing");
    expect(names).toContain("Code Quality");
    expect(names).toContain("Integration");
    expect(names).toContain("Design Principles");
    expect(names).toContain("Error Handling");
  });

  it("returns 9 backend dimensions (6 universal + 3 backend)", () => {
    const dims = getDimensions("backend");
    expect(dims).toHaveLength(9);
    const names = dims.map(d => d.name);
    expect(names).toContain("API Design");
    expect(names).toContain("Data Integrity");
    expect(names).toContain("Concurrency Safety");
  });

  it("returns 9 frontend dimensions (6 universal + 3 frontend)", () => {
    const dims = getDimensions("frontend");
    expect(dims).toHaveLength(9);
    const names = dims.map(d => d.name);
    expect(names).toContain("UI/UX Quality");
    expect(names).toContain("Component Architecture");
    expect(names).toContain("Accessibility");
  });

  it("returns 12 fullstack dimensions (6 + 3 + 3)", () => {
    const dims = getDimensions("fullstack");
    expect(dims).toHaveLength(12);
    const names = dims.map(d => d.name);
    expect(names).toContain("Correctness");
    expect(names).toContain("API Design");
    expect(names).toContain("UI/UX Quality");
  });

  it("each dimension has required fields", () => {
    const dims = getDimensions("fullstack");
    for (const dim of dims) {
      expect(dim.id).toBeTruthy();
      expect(dim.name).toBeTruthy();
      expect(dim.description).toBeTruthy();
      expect(dim.weight).toBeGreaterThan(0);
      expect(dim.threshold).toBeGreaterThanOrEqual(1);
      expect(dim.threshold).toBeLessThanOrEqual(10);
      expect(dim.rubric).toBeTruthy();
    }
  });
});

describe("formatDimensionsBlock", () => {
  it("includes name, threshold, weight, and rubric for each dimension", () => {
    const dims = getDimensions("universal");
    const block = formatDimensionsBlock(dims);

    expect(block).toContain("### Correctness (weight: 2, min: 6/10)");
    expect(block).toContain("### Testing (weight: 1.5, min: 5/10)");
    expect(block).toContain("Rubric:");
    expect(block).toContain("Features work as specified");
  });

  it("formats backend dimensions", () => {
    const dims = getDimensions("backend");
    const block = formatDimensionsBlock(dims);

    expect(block).toContain("### API Design (weight: 1.5, min: 6/10)");
    expect(block).toContain("### Data Integrity (weight: 1.5, min: 6/10)");
  });
});
