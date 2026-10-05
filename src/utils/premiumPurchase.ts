import RazorpayCheckout from "react-native-razorpay";
import { createPurchaseOrder, verifyPurchasePayment } from "./contentPurchaseApi";

export type PurchaseOutcome =
  | { outcome: "verified"; purchaseId: string }
  | { outcome: "already_purchased" }
  | { outcome: "cancelled" }
  | { outcome: "failed"; message: string };

/**
 * Runs the full Phase 2D premium purchase flow:
 *   1. Creates a Razorpay order via the backend (server-authoritative price/currency).
 *   2. Opens Razorpay Checkout.
 *   3. Verifies the payment server-side.
 *
 * Returns a typed outcome — callers must NOT unlock content on "verified".
 * Media access is Phase 2E.
 *
 * Never trusts client-side price/currency — the backend resolves those from DB.
 */
export async function performPremiumPurchase(params: {
  contentType: "post" | "story";
  contentId: string;
}): Promise<PurchaseOutcome> {
  // Step 1: Create order (backend resolves price/currency from DB)
  const orderRes = await createPurchaseOrder(params);

  if (!orderRes.success) {
    return { outcome: "failed", message: orderRes.message || "Failed to create purchase order" };
  }

  if (orderRes.alreadyPurchased) {
    return { outcome: "already_purchased" };
  }

  const { purchaseId, payment } = orderRes;

  if (!purchaseId || !payment) {
    return { outcome: "failed", message: "Invalid order response from server" };
  }

  // Step 2: Open Razorpay Checkout (or mock in test/dev mode)
  if (payment.isMock) {
    // Test mode: Razorpay keys not configured — simulate verification
    const verifyRes = await verifyPurchasePayment({
      purchaseId,
      razorpay_payment_id: `mock_pay_${Date.now().toString(36)}`,
      razorpay_order_id: payment.orderId,
      razorpay_signature: "mock_test_signature",
    });

    if (!verifyRes.success) {
      return { outcome: "failed", message: verifyRes.message || "Verification failed" };
    }

    return { outcome: "verified", purchaseId };
  }

  let razorpayResponse: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };

  try {
    razorpayResponse = await RazorpayCheckout.open({
      key: payment.keyId,
      order_id: payment.orderId,
      amount: payment.amount,
      currency: payment.currency,
      name: payment.name,
      description: payment.description,
      prefill: payment.prefill,
    }) as typeof razorpayResponse;
  } catch (checkoutError: any) {
    // Razorpay passes { code: 0 } for user cancellation
    if (checkoutError?.code === 0) {
      return { outcome: "cancelled" };
    }
    return {
      outcome: "failed",
      message: checkoutError?.description || checkoutError?.message || "Payment was not completed",
    };
  }

  // Step 3: Verify with backend — NEVER trust client-side success alone
  const verifyRes = await verifyPurchasePayment({
    purchaseId,
    razorpay_payment_id: razorpayResponse.razorpay_payment_id,
    razorpay_order_id: razorpayResponse.razorpay_order_id,
    razorpay_signature: razorpayResponse.razorpay_signature,
  });

  if (!verifyRes.success) {
    return { outcome: "failed", message: verifyRes.message || "Payment verification failed" };
  }

  return { outcome: "verified", purchaseId };
}
