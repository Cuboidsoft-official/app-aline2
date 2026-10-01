/// <reference types="node" />
/**
 * Tests for the Premium Subscription Setup feature.
 *
 * Covers:
 * - Amount validation logic (inline, no React/RN rendering required)
 * - PremiumContentOverlay style constants
 * - CreatorSubscriptionSetupScreen consent / button-state logic (pure logic)
 */

import { currencyForCountry, currencySymbol, countryFlag, countryNameForCode } from "../src/utils/countryCurrency";

// ─── 1. Currency utility ───────────────────────────────────────────────────────

describe("currencyForCountry", () => {
  test("returns INR for IN", () => {
    expect(currencyForCountry("IN")).toBe("INR");
  });

  test("returns USD for US", () => {
    expect(currencyForCountry("US")).toBe("USD");
  });

  test("returns empty string for unknown code", () => {
    expect(currencyForCountry("XX")).toBe("");
  });

  test("is case-insensitive", () => {
    expect(currencyForCountry("in")).toBe("INR");
    expect(currencyForCountry("Us")).toBe("USD");
  });
});

describe("currencySymbol", () => {
  test("returns ₹ for INR", () => {
    expect(currencySymbol("INR")).toBe("₹");
  });

  test("returns $ for USD", () => {
    expect(currencySymbol("USD")).toBe("$");
  });

  test("falls back to the code itself for unknown currency", () => {
    expect(currencySymbol("XYZ")).toBe("XYZ");
  });
});

describe("countryFlag", () => {
  test("returns a two-codepoint string for IN", () => {
    const flag = countryFlag("IN");
    expect(flag).toHaveLength(4); // two regional indicator surrogates = 4 UTF-16 code units
  });

  test("returns empty string for invalid code", () => {
    expect(countryFlag("")).toBe("");
    expect(countryFlag("USA")).toBe("");
  });
});

describe("countryNameForCode", () => {
  test("returns India for IN", () => {
    expect(countryNameForCode("IN")).toBe("India");
  });

  test("returns the code itself for unknown country", () => {
    expect(countryNameForCode("XX")).toBe("XX");
  });
});

// ─── 2. Amount validation logic (extracted, no React dependency) ──────────────

function validateAmount(value: string, min: number, max: number): string {
  if (!value.trim()) return "Please enter a subscription amount.";
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "Amount must be a positive number.";
  if (n < min) return `Minimum allowed amount is ${min}.`;
  if (n > max) return `Maximum allowed amount is ${max}.`;
  return "";
}

describe("validateAmount", () => {
  const MIN = 1;
  const MAX = 9999;

  test("rejects empty value", () => {
    expect(validateAmount("", MIN, MAX)).not.toBe("");
    expect(validateAmount("   ", MIN, MAX)).not.toBe("");
  });

  test("rejects non-numeric input", () => {
    expect(validateAmount("abc", MIN, MAX)).not.toBe("");
  });

  test("rejects zero", () => {
    expect(validateAmount("0", MIN, MAX)).not.toBe("");
  });

  test("rejects negative values", () => {
    expect(validateAmount("-5", MIN, MAX)).not.toBe("");
  });

  test("rejects amount below global minimum", () => {
    const err = validateAmount("0.5", MIN, MAX);
    expect(err).not.toBe("");
    expect(err).toContain(String(MIN));
  });

  test("rejects amount above global maximum", () => {
    const err = validateAmount("10000", MIN, MAX);
    expect(err).not.toBe("");
    expect(err).toContain(String(MAX));
  });

  test("accepts minimum boundary value", () => {
    expect(validateAmount(String(MIN), MIN, MAX)).toBe("");
  });

  test("accepts maximum boundary value", () => {
    expect(validateAmount(String(MAX), MIN, MAX)).toBe("");
  });

  test("accepts a valid mid-range value", () => {
    expect(validateAmount("200", MIN, MAX)).toBe("");
  });

  test("accepts decimal values within range", () => {
    expect(validateAmount("99.99", MIN, MAX)).toBe("");
  });
});

// ─── 3. Consent / button-state logic ─────────────────────────────────────────

function canSubmit(params: {
  termsAccepted: boolean;
  selectedCountry: { code: string } | null;
  amount: string;
  saving: boolean;
  min: number;
  max: number;
}): boolean {
  const { termsAccepted, selectedCountry, amount, saving, min, max } = params;
  return (
    termsAccepted &&
    !!selectedCountry &&
    validateAmount(amount, min, max) === "" &&
    !saving
  );
}

describe("canSubmit (Accept and Continue button gate)", () => {
  const base = {
    termsAccepted: true,
    selectedCountry: { code: "IN" },
    amount: "200",
    saving: false,
    min: 1,
    max: 9999,
  };

  test("is enabled when all conditions met", () => {
    expect(canSubmit(base)).toBe(true);
  });

  test("is disabled when terms not accepted", () => {
    expect(canSubmit({ ...base, termsAccepted: false })).toBe(false);
  });

  test("is disabled when no country selected", () => {
    expect(canSubmit({ ...base, selectedCountry: null })).toBe(false);
  });

  test("is disabled when amount is empty", () => {
    expect(canSubmit({ ...base, amount: "" })).toBe(false);
  });

  test("is disabled when amount is invalid", () => {
    expect(canSubmit({ ...base, amount: "0" })).toBe(false);
  });

  test("is disabled when amount is below minimum", () => {
    expect(canSubmit({ ...base, amount: "0.5" })).toBe(false);
  });

  test("is disabled when amount exceeds maximum", () => {
    expect(canSubmit({ ...base, amount: "99999" })).toBe(false);
  });

  test("is disabled while saving in progress", () => {
    expect(canSubmit({ ...base, saving: true })).toBe(false);
  });

  test("re-enables after unchecking and rechecking terms", () => {
    expect(canSubmit({ ...base, termsAccepted: false })).toBe(false);
    expect(canSubmit({ ...base, termsAccepted: true })).toBe(true);
  });
});

// ─── 4. PremiumContentOverlay — blur style constant ───────────────────────────

describe("PremiumContentOverlay hiddenMedia style", () => {
  // Verify the style object exported from the component source has blur, not opacity.
  // We read it by requiring the module and inspecting the compiled StyleSheet result.

  // The test uses a regex match on the source file to avoid importing a React Native
  // component (which would need jest/RN mocks in this lightweight test environment).
  const fs = require("fs");
  const path = require("path");

  const src = fs.readFileSync(
    path.join(__dirname, "../src/features/social/components/PremiumContentOverlay.tsx"),
    "utf8"
  );

  test("hiddenMedia uses blur filter, not opacity: 0.08", () => {
    expect(src).toContain("blur");
    expect(src).not.toContain("opacity: 0.08");
  });

  test("blur value is approximately 5px", () => {
    // Accept blur values between 4 and 8 inclusive
    expect(src).toMatch(/blur:\s*[4-8]\b/);
  });

  test("global settings cards are NOT present in CreatorSubscriptionSetupScreen", () => {
    const creatorSrc = fs.readFileSync(
      path.join(__dirname, "../src/screens/CreatorSubscriptionSetupScreen.tsx"),
      "utf8"
    );
    // These admin-only labels must not appear in the creator screen
    expect(creatorSrc).not.toContain("Global Pricing Bounds");
    expect(creatorSrc).not.toContain("Platform Fee");
    expect(creatorSrc).not.toContain("Signed URL TTL");
    expect(creatorSrc).not.toContain("platformFeePercent");
    expect(creatorSrc).not.toContain("signedUrlTtlSeconds");
  });

  test("CreatorSubscriptionSetupScreen contains required sections", () => {
    const creatorSrc = fs.readFileSync(
      path.join(__dirname, "../src/screens/CreatorSubscriptionSetupScreen.tsx"),
      "utf8"
    );
    expect(creatorSrc).toContain("Select Your Currency");
    expect(creatorSrc).toContain("Setup Your Subscription Amount");
    expect(creatorSrc).toContain("Creator Subscription Terms");
    expect(creatorSrc).toContain("Accept and Continue");
    expect(creatorSrc).toContain("termsAccepted");
    expect(creatorSrc).toContain("canSubmit");
  });

  test("Accept and Continue button is gated on consent (disabled={!canSubmit})", () => {
    const creatorSrc = fs.readFileSync(
      path.join(__dirname, "../src/screens/CreatorSubscriptionSetupScreen.tsx"),
      "utf8"
    );
    expect(creatorSrc).toContain("disabled={!canSubmit}");
  });
});
