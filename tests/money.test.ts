import { describe, expect, it } from "vitest";
import { budgetInput, formatBudget, minorAmount } from "../src/lib/money";

describe("shared project and proposal currency amounts", () => {
  it("converts human amounts to integer minor units with currency-specific precision", () => {
    expect(minorAmount("123.45", "GBP")).toBe(12345);
    expect(minorAmount("12345", "JPY")).toBe(12345);
    expect(minorAmount("12.345", "KWD")).toBe(12345);
    expect(minorAmount("0.001", "KWD")).toBe(1);
    expect(minorAmount("0", "GBP")).toBe(0);
    expect(minorAmount("", "GBP")).toBeNull();
  });
  it("prefills editable values without changing zero-, two- or three-decimal budgets", () => {
    for (const currency of ["GBP", "JPY", "KWD"]) {
      expect(minorAmount(budgetInput(12345, currency), currency)).toBe(12345);
      expect(minorAmount(budgetInput(2147483647, currency), currency)).toBe(
        2147483647,
      );
    }
    expect(budgetInput(1, "KWD")).toBe("0.001");
    expect(budgetInput(null, "GBP")).toBe("");
  });
  it("renders the same currency value in proposal cards/summaries and project views", () => {
    expect(formatBudget(12345, "GBP")).toBe("£123.45");
    expect(formatBudget(12345, "JPY")).toContain("12,345");
    expect(formatBudget(12345, "KWD")).toContain("12.345");
    expect(formatBudget(null, "GBP")).toBe("Budget not set");
  });
  it("uses the XCG code consistently across server and older browser currency data", () => {
    expect(formatBudget(12501, "XCG")).toBe("XCG\u00a0125.01");
    expect(minorAmount(budgetInput(12501, "XCG"), "XCG")).toBe(12501);
  });
  it("rejects unsupported precision, malformed currency and overflow before JSON serialization", () => {
    for (const [value, currency] of [
      ["1.2", "JPY"],
      ["1.234", "GBP"],
      ["1.2345", "KWD"],
      ["-1", "GBP"],
      ["Infinity", "GBP"],
      ["9".repeat(400), "GBP"],
      ["21474836.48", "GBP"],
      ["1", "gbp"],
    ])
      expect(() => minorAmount(value ?? "", currency ?? "")).toThrow();
    expect(minorAmount("21474836.47", "GBP")).toBe(2147483647);
  });
});
