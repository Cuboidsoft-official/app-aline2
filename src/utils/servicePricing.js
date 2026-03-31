const MODEL_LABELS = {
  per_minute: "Per minute",
  per_hour: "Per hour",
  per_message: "Per message",
  per_session: "Per session",
  package: "Package",
};

const toAmount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const withCurrency = (amount, currency = "INR") => {
  if (!amount) {
    return "";
  }

  if (currency === "INR") {
    return `₹${amount}`;
  }

  return `${currency} ${amount}`;
};

export const formatCurrencyAmount = (amount, currency = "INR") => {
  const resolvedAmount = Number(amount) || 0;
  return withCurrency(resolvedAmount, currency);
};

export const formatCurrencyTotals = (entries = []) => {
  const normalizedEntries = Array.isArray(entries)
    ? entries.filter((entry) => Number(entry?.amount) > 0)
    : [];

  if (!normalizedEntries.length) {
    return withCurrency(0, "INR");
  }

  return normalizedEntries
    .map((entry) => withCurrency(Number(entry.amount) || 0, entry.currency || "INR"))
    .join(" • ");
};

export const formatSummaryAmount = (summary, key) => {
  const amountKeyMap = {
    active: "activeAmount",
    completed: "completedAmount",
    paid: "paidAmount",
    refundPending: "refundPendingAmount",
    settlementPending: "settlementPendingAmount",
  };
  const totalsKeyMap = {
    active: "activeAmountByCurrency",
    completed: "completedAmountByCurrency",
    paid: "paidAmountByCurrency",
    refundPending: "refundPendingAmountByCurrency",
    settlementPending: "settlementPendingAmountByCurrency",
  };
  const displayCurrencyKeyMap = {
    active: "activeDisplayCurrency",
    completed: "completedDisplayCurrency",
    paid: "paidDisplayCurrency",
    refundPending: "refundPendingDisplayCurrency",
    settlementPending: "settlementPendingDisplayCurrency",
  };
  const amountKey = amountKeyMap[key] || "completedAmount";
  const totalsKey = totalsKeyMap[key] || "completedAmountByCurrency";
  const displayCurrencyKey = displayCurrencyKeyMap[key] || "completedDisplayCurrency";
  const totals = Array.isArray(summary?.[totalsKey]) ? summary[totalsKey] : [];

  if (totals.length > 1) {
    return formatCurrencyTotals(totals);
  }

  if (totals.length === 1) {
    return withCurrency(Number(totals[0].amount) || 0, totals[0].currency || "INR");
  }

  return withCurrency(Number(summary?.[amountKey]) || 0, summary?.[displayCurrencyKey] || summary?.displayCurrency || "INR");
};

export const getServicePricingOptions = (service) => {
  if (Array.isArray(service?.pricingOptions) && service.pricingOptions.length) {
    return service.pricingOptions
      .filter((item) => toAmount(item?.amount) > 0)
      .map((item) => ({
        model: item.model,
        label: item.label || MODEL_LABELS[item.model] || "Pricing",
        amount: toAmount(item.amount),
        isDefault: Boolean(item.isDefault),
        durationMinutes: item.durationMinutes || 0,
      }));
  }

  const options = [
    { model: "per_minute", label: MODEL_LABELS.per_minute, amount: toAmount(service?.pricePerMin) },
    { model: "per_hour", label: MODEL_LABELS.per_hour, amount: toAmount(service?.pricePerHour), durationMinutes: 60 },
    { model: "per_message", label: MODEL_LABELS.per_message, amount: toAmount(service?.pricePerMsg) },
    { model: "per_session", label: MODEL_LABELS.per_session, amount: toAmount(service?.pricePerSession), durationMinutes: toAmount(service?.sessionDurationMinutes) },
    { model: "package", label: MODEL_LABELS.package, amount: toAmount(service?.packagePrice) },
  ].filter((item) => item.amount > 0);

  return options.map((item, index) => ({
    ...item,
    isDefault: index === 0,
  }));
};

export const getPrimaryPricingOption = (service) => {
  const options = getServicePricingOptions(service);
  return options.find((item) => item.isDefault) || options[0] || null;
};

export const formatPricingOption = (option, currency = "INR") => {
  if (!option) {
    return "Pricing unavailable";
  }

  const amount = withCurrency(option.amount, currency);
  if (!amount) {
    return "Pricing unavailable";
  }

  if (option.model === "per_session" && option.durationMinutes) {
    return `${amount} / ${option.durationMinutes} min session`;
  }

  return `${amount} / ${option.label.toLowerCase()}`;
};

export const formatPrimaryServicePrice = (service) => {
  const primary = getPrimaryPricingOption(service);
  return formatPricingOption(primary, service?.currency || "INR");
};
