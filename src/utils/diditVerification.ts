import { API } from "../api/api";

export interface DiditVerificationSessionParams {
  sellerId?: string;
  userIp?: string;
}

export interface DiditSessionResponse {
  success: boolean;
  sessionId: string;
  verificationUrl: string;
  status: "PENDING" | "IN_REVIEW" | "APPROVED" | "DECLINED";
  features: string[];
}

export interface DiditStatusResponse {
  success: boolean;
  status: "PENDING" | "IN_REVIEW" | "APPROVED" | "DECLINED";
  documentVerified: boolean;
  livenessPassed: boolean;
  faceMatchPassed: boolean;
  ipAddressVerified: boolean;
  clientIp?: string;
  verifiedAt?: string;
}

/**
 * Creates a Didit Seller Identity Verification Session
 * Strictly requests 4 features:
 * 1. Document Verification (ID scan)
 * 2. Liveness Check (live face movement)
 * 3. Selfie Match (face match selfie vs ID document)
 * 4. IP Address Validation
 * (Zero age references or age checks)
 */
export const createDiditVerificationSession = async (
  params: DiditVerificationSessionParams = {}
): Promise<DiditSessionResponse> => {
  const response = await API.post("/seller/verification/didit/session", {
    sellerId: params.sellerId || "",
    userIp: params.userIp || "",
    requestedFeatures: ["document_verification", "liveness", "face_match", "ip_check"],
  });
  return response.data || {};
};

/**
 * Checks Didit Verification Status by Session ID
 */
export const fetchDiditVerificationStatus = async (
  sessionId: string
): Promise<DiditStatusResponse> => {
  const response = await API.get(`/seller/verification/didit/status/${sessionId}`);
  return response.data || {};
};
