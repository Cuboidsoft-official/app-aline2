/// <reference types="node" />
/**
 * Unit tests for PremiumSettingsScreen logic (validation, payload shape,
 * state helpers). These tests do not mount the component — they exercise
 * pure-function equivalents of the screen's internal helpers so the suite
 * runs fast without a renderer or network.
 */

// ─── Validation helper (mirrors validateDraft in the screen) ─────────────────

type CountryPricingEntry = {
  countryCode: string;
  currency: string;
  amount: string;
  enabled: boolean;
};

type GlobalBounds = { minPriceINR: number; maxPriceINR: number };

function validateDraft(
  entries: CountryPricingEntry[],
  bounds: GlobalBounds,
): string | null {
  const seenCodes = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const code = entry.countryCode.trim().toUpperCase();
    const currency = entry.currency.trim().toUpperCase();
    const amount = Number(entry.amount);

    if (!/^[A-Z]{2}$/.test(code)) {
      return `Country [${i + 1}]: invalid country code "${entry.countryCode}".`;
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      return `Country [${i + 1}] (${code}): invalid currency "${entry.currency}".`;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return `Country [${i + 1}] (${code}): amount must be a positive number.`;
    }
    if (amount < bounds.minPriceINR) {
      return `Country [${i + 1}] (${code}): amount must be at least ${bounds.minPriceINR}.`;
    }
    if (amount > bounds.maxPriceINR) {
      return `Country [${i + 1}] (${code}): amount cannot exceed ${bounds.maxPriceINR}.`;
    }
    if (seenCodes.has(code)) {
      return `Duplicate country code "${code}". Each country may appear only once.`;
    }
    seenCodes.add(code);
  }
  return null;
}

// ─── Payload builder (mirrors the save payload in saveSettings) ──────────────

function buildPayload(
  premiumContentEnabled: boolean,
  entries: CountryPricingEntry[],
) {
  return {
    premiumContentEnabled,
    countryPricing: entries.map((e) => ({
      countryCode: e.countryCode.trim().toUpperCase(),
      currency: e.currency.trim().toUpperCase(),
      amount: Number(e.amount),
      enabled: e.enabled,
    })),
  };
}

// ─── serverEntryToLocal (mirrors the screen helper) ──────────────────────────

function serverEntryToLocal(e: any): CountryPricingEntry & { countryName: string; flag: string } {
  const code = String(e.countryCode || "").toUpperCase();
  const flagFromCode = (c: string) => {
    if (!c || c.length !== 2) return "🏳️";
    return [...c.toUpperCase()]
      .map((ch) => String.fromCodePoint(ch.charCodeAt(0) + 127397))
      .join("");
  };
  return {
    countryCode: code,
    countryName: e.countryName || code,
    flag: e.flag || flagFromCode(code),
    currency: String(e.currency || "").toUpperCase(),
    amount: String(e.amount ?? ""),
    enabled: e.enabled !== false,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const DEFAULT_BOUNDS: GlobalBounds = { minPriceINR: 1, maxPriceINR: 9999 };

describe("PremiumSettingsScreen — validateDraft", () => {
  it("returns null for a valid single entry", () => {
    const entry: CountryPricingEntry = {
      countryCode: "IN",
      currency: "INR",
      amount: "299",
      enabled: true,
    };
    expect(validateDraft([entry], DEFAULT_BOUNDS)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(validateDraft([], DEFAULT_BOUNDS)).toBeNull();
  });

  it("returns error for invalid country code (too long)", () => {
    const entry: CountryPricingEntry = {
      countryCode: "IND",
      currency: "INR",
      amount: "299",
      enabled: true,
    };
    expect(validateDraft([entry], DEFAULT_BOUNDS)).toMatch(/invalid country code/);
  });

  it("returns error for invalid currency (too short)", () => {
    const entry: CountryPricingEntry = {
      countryCode: "US",
      currency: "US",
      amount: "9.99",
      enabled: true,
    };
    expect(validateDraft([entry], DEFAULT_BOUNDS)).toMatch(/invalid currency/);
  });

  it("returns error for zero amount", () => {
    const entry: CountryPricingEntry = {
      countryCode: "US",
      currency: "USD",
      amount: "0",
      enabled: true,
    };
    expect(validateDraft([entry], DEFAULT_BOUNDS)).toMatch(/positive number/);
  });

  it("returns error for negative amount", () => {
    const entry: CountryPricingEntry = {
      countryCode: "US",
      currency: "USD",
      amount: "-5",
      enabled: true,
    };
    expect(validateDraft([entry], DEFAULT_BOUNDS)).toMatch(/positive number/);
  });

  it("returns error when amount is below minPriceINR", () => {
    const bounds: GlobalBounds = { minPriceINR: 50, maxPriceINR: 9999 };
    const entry: CountryPricingEntry = {
      countryCode: "IN",
      currency: "INR",
      amount: "10",
      enabled: true,
    };
    expect(validateDraft([entry], bounds)).toMatch(/at least 50/);
  });

  it("returns error when amount exceeds maxPriceINR", () => {
    const bounds: GlobalBounds = { minPriceINR: 1, maxPriceINR: 500 };
    const entry: CountryPricingEntry = {
      countryCode: "IN",
      currency: "INR",
      amount: "999",
      enabled: true,
    };
    expect(validateDraft([entry], bounds)).toMatch(/cannot exceed 500/);
  });

  it("returns error for duplicate country codes", () => {
    const entries: CountryPricingEntry[] = [
      { countryCode: "IN", currency: "INR", amount: "299", enabled: true },
      { countryCode: "IN", currency: "INR", amount: "399", enabled: true },
    ];
    expect(validateDraft(entries, DEFAULT_BOUNDS)).toMatch(/Duplicate country code/);
  });

  it("accepts multiple distinct valid entries", () => {
    const entries: CountryPricingEntry[] = [
      { countryCode: "IN", currency: "INR", amount: "299", enabled: true },
      { countryCode: "US", currency: "USD", amount: "4.99", enabled: true },
      { countryCode: "GB", currency: "GBP", amount: "3.99", enabled: false },
    ];
    expect(validateDraft(entries, DEFAULT_BOUNDS)).toBeNull();
  });

  it("treats country codes case-insensitively for duplicates", () => {
    const entries: CountryPricingEntry[] = [
      { countryCode: "in", currency: "INR", amount: "299", enabled: true },
      { countryCode: "IN", currency: "INR", amount: "399", enabled: true },
    ];
    expect(validateDraft(entries, DEFAULT_BOUNDS)).toMatch(/Duplicate/);
  });
});

// ─── buildPayload ─────────────────────────────────────────────────────────────

describe("PremiumSettingsScreen — buildPayload", () => {
  it("includes only premiumContentEnabled and countryPricing", () => {
    const payload = buildPayload(true, [
      { countryCode: "IN", currency: "INR", amount: "299", enabled: true },
    ]);
    const keys = Object.keys(payload);
    expect(keys).toEqual(["premiumContentEnabled", "countryPricing"]);
  });

  it("does NOT include any admin-only fields", () => {
    const payload = buildPayload(false, []) as any;
    expect(payload.minPriceINR).toBeUndefined();
    expect(payload.maxPriceINR).toBeUndefined();
    expect(payload.platformFeePercent).toBeUndefined();
    expect(payload.signedUrlTtlSeconds).toBeUndefined();
    expect(payload.defaultTier).toBeUndefined();
  });

  it("converts amount to number in countryPricing", () => {
    const payload = buildPayload(true, [
      { countryCode: "US", currency: "USD", amount: "9.99", enabled: true },
    ]);
    expect(typeof payload.countryPricing[0].amount).toBe("number");
    expect(payload.countryPricing[0].amount).toBe(9.99);
  });

  it("uppercases countryCode and currency", () => {
    const payload = buildPayload(true, [
      { countryCode: "us", currency: "usd", amount: "9.99", enabled: false },
    ]);
    expect(payload.countryPricing[0].countryCode).toBe("US");
    expect(payload.countryPricing[0].currency).toBe("USD");
  });

  it("preserves enabled=false for disabled entries", () => {
    const payload = buildPayload(true, [
      { countryCode: "GB", currency: "GBP", amount: "3.99", enabled: false },
    ]);
    expect(payload.countryPricing[0].enabled).toBe(false);
  });
});

// ─── serverEntryToLocal ───────────────────────────────────────────────────────

describe("PremiumSettingsScreen — serverEntryToLocal", () => {
  it("maps a full server entry correctly", () => {
    const raw = {
      _id: "abc123",
      countryCode: "IN",
      countryName: "India",
      flag: "🇮🇳",
      currency: "inr",
      amount: 299,
      enabled: true,
    };
    const local = serverEntryToLocal(raw);
    expect(local.countryCode).toBe("IN");
    expect(local.currency).toBe("INR");
    expect(local.amount).toBe("299");
    expect(local.enabled).toBe(true);
    expect(local.flag).toBe("🇮🇳");
  });

  it("defaults enabled to true when field is missing", () => {
    const raw = { countryCode: "US", currency: "USD", amount: 9 };
    expect(serverEntryToLocal(raw).enabled).toBe(true);
  });

  it("sets enabled=false when server says false", () => {
    const raw = { countryCode: "US", currency: "USD", amount: 9, enabled: false };
    expect(serverEntryToLocal(raw).enabled).toBe(false);
  });

  it("converts amount to string", () => {
    const raw = { countryCode: "DE", currency: "EUR", amount: 4.99 };
    expect(serverEntryToLocal(raw).amount).toBe("4.99");
  });

  it("generates emoji flag when flag field is missing", () => {
    const raw = { countryCode: "US", currency: "USD", amount: 10 };
    const local = serverEntryToLocal(raw);
    expect(local.flag).toBe("🇺🇸");
  });
});

// ─── termsAccepted guard ──────────────────────────────────────────────────────

describe("PremiumSettingsScreen — Accept and Continue guard", () => {
  it("canSubmit is false when termsAccepted is false", () => {
    const termsAccepted = false;
    const saving = false;
    const canSubmit = termsAccepted && !saving;
    expect(canSubmit).toBe(false);
  });

  it("canSubmit is true when termsAccepted is true and not saving", () => {
    const termsAccepted = true;
    const saving = false;
    const canSubmit = termsAccepted && !saving;
    expect(canSubmit).toBe(true);
  });

  it("canSubmit is false when saving is in progress even if terms accepted", () => {
    const termsAccepted = true;
    const saving = true;
    const canSubmit = termsAccepted && !saving;
    expect(canSubmit).toBe(false);
  });
});
