import { API } from "../api/api";

export interface PurchaseOrderPayment {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  provider: string;
  isMock: boolean;
  prefill: { name: string; email: string };
  name: string;
  description: string;
}

export interface CreateOrderResponse {
  success: boolean;
  alreadyPurchased?: boolean;
  message?: string;
  purchaseId?: string;
  payment?: PurchaseOrderPayment;
}

export interface PurchaseRecord {
  id: string;
  status: string;
  contentType: string;
  contentId: string;
  amount: number;
  currency: string;
  verifiedAt: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  alreadyVerified?: boolean;
  message?: string;
  purchase?: PurchaseRecord;
}

export async function createPurchaseOrder(params: {
  contentType: "post" | "story";
  contentId: string;
}): Promise<CreateOrderResponse> {
  const res = await API.post("/content-purchases/order", params);
  return res.data as CreateOrderResponse;
}

export async function verifyPurchasePayment(params: {
  purchaseId: string;
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}): Promise<VerifyPaymentResponse> {
  const { purchaseId, ...body } = params;
  const res = await API.post(`/content-purchases/${purchaseId}/verify`, body);
  return res.data as VerifyPaymentResponse;
}
