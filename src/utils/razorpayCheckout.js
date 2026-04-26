export const openRazorpayCheckout = async (payment = {}) => {
  const isManualTestCheckout =
    Boolean(payment?.isMock)
    || String(payment?.provider || "").trim().toLowerCase() === "manual_test";

  if (isManualTestCheckout) {
    const timestamp = Date.now();
    const orderId = String(payment?.orderId || `manual_test_order_${timestamp}`);
    const paymentId = String(payment?.testPaymentId || `manual_test_pay_${timestamp}`);

    return {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: "manual_test",
      testPaymentId: paymentId,
      provider: "manual_test",
    };
  }

  const RazorpayCheckout = require("react-native-razorpay");
  const options = {
    key: payment.keyId,
    amount: payment.amount,
    currency: payment.currency || "INR",
    name: payment.name || "Aline2",
    description: payment.description || "Booking payment",
    order_id: payment.orderId,
    prefill: payment.prefill || {},
    theme: { color: "#7B4DFF" },
  };

  return RazorpayCheckout.open(options);
};
