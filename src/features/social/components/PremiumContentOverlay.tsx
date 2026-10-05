import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { currencySymbol } from "../../../utils/countryCurrency";

interface PremiumContentOverlayProps {
  isPremium?: boolean;
  premiumPrice?: number;
  premiumCurrency?: string;
  /** True when the viewing user is the content creator — skips paywall. */
  isOwner?: boolean;
  /** Called when the viewer taps "Unlock". Wired to the Razorpay payment flow in Phase 2D. */
  onUnlockPress?: () => void;
  /** True while the payment flow is in progress — shows a spinner. */
  loading?: boolean;
  /** True after payment is server-verified — shows purchase-success state. Media is NOT unlocked. */
  purchaseVerified?: boolean;
  /** True when the server has confirmed this viewer holds an active entitlement (Phase 2E). */
  premiumUnlocked?: boolean;
  children: React.ReactNode;
  /** Optional extra style applied to the wrapping container. */
  style?: object;
  /**
   * When true, renders children at full opacity with a ~50% dark overlay instead of
   * the default near-hidden (8% opacity) treatment. Use for stories where the viewer
   * should be able to recognise the preview image beneath the paywall.
   * Has no effect once the content is unlocked.
   */
  previewMode?: boolean;
}

/**
 * Wraps media content with a premium paywall overlay when required.
 *
 * Renders children unchanged when:
 *   - isPremium is falsy (normal content)
 *   - isOwner is true (creator viewing their own content)
 *
 * When locked: renders children with a ~5px blur (visually obscured without
 * removing them from layout) and places a full-cover dark overlay on top
 * showing a lock badge, price, and an Unlock CTA.
 *
 * NOTE: client-side blur is NOT a security measure — it is display-only
 * gating. Secure media delivery (signed URLs, entitlement) is Phase 2E.
 */
export default function PremiumContentOverlay({
  isPremium,
  premiumPrice,
  premiumCurrency,
  isOwner,
  onUnlockPress,
  loading = false,
  purchaseVerified = false,
  premiumUnlocked = false,
  children,
  style,
  previewMode = false,
}: PremiumContentOverlayProps) {
  // Server-confirmed entitlement (premiumUnlocked) always unlocks regardless of purchaseVerified state
  const isLocked = !!isPremium && !isOwner && !premiumUnlocked;

  if (!isLocked) {
    return <>{children}</>;
  }

  const sym = currencySymbol(String(premiumCurrency || "").toUpperCase());
  const priceLabel =
    typeof premiumPrice === "number" && premiumPrice > 0
      ? `${sym}${premiumPrice}`
      : null;
  const ctaLabel = priceLabel ? `Unlock for ${priceLabel}` : "Unlock";

  // Payment verified state — content remains locked, media access is Phase 2E
  if (purchaseVerified) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.hiddenMedia} pointerEvents="none">
          {children}
        </View>
        <View style={styles.overlay} pointerEvents="none">
          <View style={[styles.lockBadge, styles.verifiedBadge]}>
            <Icon name="checkmark-circle" size={13} color="#fff" />
            <Text style={styles.lockBadgeText}>PAYMENT VERIFIED</Text>
          </View>
          <View style={styles.priceBlock}>
            <Text style={styles.premiumLabel}>Payment Received</Text>
            <Text style={styles.verifiedSubtext}>Loading your content…</Text>
          </View>
        </View>
      </View>
    );
  }

  // Loading state — payment in progress
  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.hiddenMedia} pointerEvents="none">
          {children}
        </View>
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
          <Text style={[styles.premiumLabel, styles.loadingText]}>Processing payment…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {/* Media: full opacity in previewMode (story preview), near-hidden otherwise (post). */}
      <View style={previewMode ? styles.visibleMedia : styles.hiddenMedia} pointerEvents="none">
        {children}
      </View>

      {/* Paywall overlay: semi-transparent in previewMode so story media stays visible. */}
      <View style={[styles.overlay, previewMode && styles.overlayPreview]} pointerEvents="box-none">
        <View style={styles.lockBadge}>
          <Icon name="lock-closed" size={13} color="#fff" />
          <Text style={styles.lockBadgeText}>PREMIUM</Text>
        </View>

        <View style={styles.priceBlock}>
          <Text style={styles.premiumLabel}>Premium Content</Text>
          {priceLabel ? <Text style={styles.priceText}>{priceLabel}</Text> : null}
        </View>

        <TouchableOpacity
          style={styles.unlockButton}
          activeOpacity={0.82}
          onPress={onUnlockPress}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
        >
          <Icon name="lock-open-outline" size={16} color="#fff" style={styles.unlockIcon} />
          <Text style={styles.unlockText}>{ctaLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const ACCENT = "#9b4dff";

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  hiddenMedia: {
    // ~5px blur makes content recognisable but unreadable; display-only, not a security boundary.
    filter: [{ blur: 5 }],
  },
  visibleMedia: {
    opacity: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,4,20,0.78)",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  overlayPreview: {
    backgroundColor: "rgba(10,4,20,0.52)",
  },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  lockBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  priceBlock: {
    alignItems: "center",
    gap: 4,
  },
  premiumLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    fontWeight: "500",
  },
  priceText: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
  },
  unlockButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  unlockIcon: {
    opacity: 0.9,
  },
  unlockText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  verifiedBadge: {
    backgroundColor: "#22c55e",
  },
  verifiedSubtext: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontWeight: "400",
    marginTop: 2,
    textAlign: "center",
  },
  loadingText: {
    marginTop: 12,
  },
});
