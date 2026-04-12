export const shouldShowVerifiedBadge = (value: any): boolean => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const verificationStatus = String(
    value?.verificationStatus
    || value?.sellerProfile?.verificationStatus
    || value?.sellerVerificationStatus
    || ""
  )
    .trim()
    .toLowerCase();

  if (verificationStatus === "approved") {
    return true;
  }

  return value?.isVerifiedSeller === true;
};
