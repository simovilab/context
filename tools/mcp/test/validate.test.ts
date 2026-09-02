import { describe, expect, it } from "vitest";
import {
  clampK,
  MAX_QUERY_LENGTH,
  sanitizeErrorMessage,
  validateNodeId,
  validateQuery,
  ValidationError,
} from "../src/validate.js";
import type { CatalogEntry } from "../src/types.js";

function catalogWith(ids: string[]): ReadonlyMap<string, CatalogEntry> {
  const map = new Map<string, CatalogEntry>();
  for (const id of ids) {
    map.set(id, {
      id,
      name: id,
      component: null,
      kind: [],
      status: "in-progress",
      hito: null,
      due_month: null,
      depends_on: [],
      layer: "deliverable",
    });
  }
  return map;
}

describe("validateNodeId", () => {
  const catalog = catalogWith(["project", "C1", "C1P1", "INF1"]);

  it("accepts project, C#, C#P#, and INF# ids present in the catalog", () => {
    expect(validateNodeId("project", catalog)).toBe("project");
    expect(validateNodeId("C1", catalog)).toBe("C1");
    expect(validateNodeId("C1P1", catalog)).toBe("C1P1");
    expect(validateNodeId("INF1", catalog)).toBe("INF1");
  });

  it("rejects an out-of-range component id", () => {
    expect(() => validateNodeId("C9", catalog)).toThrow(ValidationError);
  });

  it("rejects wrong case", () => {
    expect(() => validateNodeId("c1p1", catalog)).toThrow(ValidationError);
  });

  it("rejects shell/path-injection-shaped ids", () => {
    expect(() => validateNodeId("C1P1;rm", catalog)).toThrow(ValidationError);
    expect(() => validateNodeId("../x", catalog)).toThrow(ValidationError);
  });

  it("rejects empty id", () => {
    expect(() => validateNodeId("", catalog)).toThrow(ValidationError);
  });

  it("rejects an id absent from the catalog even if shape-valid", () => {
    expect(() => validateNodeId("C2", catalog)).toThrow(ValidationError);
  });
});

describe("validateQuery", () => {
  it("accepts a normal query", () => {
    expect(validateQuery("GTFS realtime")).toBe("GTFS realtime");
  });

  it("rejects empty / whitespace-only query", () => {
    expect(() => validateQuery("")).toThrow(ValidationError);
    expect(() => validateQuery("   ")).toThrow(ValidationError);
  });

  it("rejects a query over 2000 characters", () => {
    expect(() => validateQuery("a".repeat(MAX_QUERY_LENGTH + 1))).toThrow(ValidationError);
  });
});

describe("clampK", () => {
  it("defaults to 5 when omitted", () => {
    expect(clampK(undefined)).toBe(5);
  });

  it("clamps below the floor up to 1", () => {
    expect(clampK(0)).toBe(1);
    expect(clampK(-5)).toBe(1);
  });

  it("clamps above the ceiling down to 20", () => {
    expect(clampK(100)).toBe(20);
  });

  it("truncates non-integers", () => {
    expect(clampK(3.9)).toBe(3);
  });
});

describe("sanitizeErrorMessage", () => {
  it("keeps only the first line", () => {
    const err = new Error("short reason\nline two\nline three");
    expect(sanitizeErrorMessage(err)).toBe("short reason");
  });

  it("redacts absolute filesystem paths", () => {
    const err = new Error("failed reading /Users/someone/secret/path/file.json");
    expect(sanitizeErrorMessage(err)).not.toContain("/Users/someone");
    expect(sanitizeErrorMessage(err)).toContain("<path>");
  });

  it("caps message length", () => {
    const err = new Error("x".repeat(1000));
    expect(sanitizeErrorMessage(err).length).toBeLessThanOrEqual(300);
  });
});
