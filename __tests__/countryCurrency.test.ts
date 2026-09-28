import {
  COUNTRY_CURRENCY,
  COUNTRY_NAMES,
  COUNTRY_OPTIONS,
  countryNameForCode,
  currencyForCountry,
} from "../src/utils/countryCurrency";

describe("countryCurrency", () => {
  it("exposes the same country set in the currency and name maps", () => {
    expect(Object.keys(COUNTRY_NAMES).sort()).toEqual(Object.keys(COUNTRY_CURRENCY).sort());
  });

  it("builds picker options sorted by display name with no duplicate codes", () => {
    expect(COUNTRY_OPTIONS.length).toBe(Object.keys(COUNTRY_CURRENCY).length);

    const codes = COUNTRY_OPTIONS.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);

    const names = COUNTRY_OPTIONS.map((c) => c.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });

  it("gives every option a currency so selecting a country always pre-fills one", () => {
    for (const option of COUNTRY_OPTIONS) {
      expect(option.currency).toBe(currencyForCountry(option.code));
      expect(option.currency).toHaveLength(3);
    }
  });

  it("derives well-known currency defaults", () => {
    expect(currencyForCountry("IN")).toBe("INR");
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry("GB")).toBe("GBP");
    expect(currencyForCountry("de")).toBe("EUR");
  });

  it("returns an empty currency and the raw code as name for unknown codes", () => {
    expect(currencyForCountry("ZZ")).toBe("");
    expect(currencyForCountry("")).toBe("");
    expect(countryNameForCode("ZZ")).toBe("ZZ");
  });

  it("resolves display names case-insensitively and falls back to the code", () => {
    expect(countryNameForCode("in")).toBe("India");
    expect(countryNameForCode("US")).toBe("United States");
  });
});
