export const openRazorpayCheckout = async (payment = {}) => {
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
