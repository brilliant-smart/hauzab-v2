import { describe, it, expect } from "vitest";
import { formatCurrency, formatNumber, formatDate } from "@/app/lib/format";

describe("formatCurrency", () => {
  it("renders null and empty as an em dash", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
    expect(formatCurrency("")).toBe("—");
  });

  it("renders a NaN string as an em dash", () => {
    expect(formatCurrency("not-a-number")).toBe("—");
  });

  it("formats numeric and string amounts as Naira", () => {
    expect(formatCurrency(5000)).toMatch(/5,?000/);
    expect(formatCurrency("1234.5")).toMatch(/1,?234\.50/);
  });

  it("keeps at most two fraction digits", () => {
    expect(formatCurrency(1.005)).not.toContain("1.005");
  });
});

describe("formatNumber", () => {
  it("renders null and empty as an em dash", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber("")).toBe("—");
  });

  it("formats integers with grouping", () => {
    expect(formatNumber(1000000)).toMatch(/1,?000,?000/);
  });
});

describe("formatDate", () => {
  it("renders null and empty as an em dash", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("renders an invalid date as an em dash", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });

  it("formats an ISO date as DD Mon YYYY", () => {
    const out = formatDate("2026-08-15T10:00:00Z");
    expect(out).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}$/);
  });
});