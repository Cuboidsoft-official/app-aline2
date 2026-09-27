import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from "react-native";
import { WebView, WebViewNavigation } from "react-native-webview";
import Icon from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../theme/AppThemeContext";
import {
  createDiditVerificationSession,
  fetchDiditVerificationStatus,
  DiditStatusResponse,
} from "../../utils/diditVerification";

interface DiditVerificationModalProps {
  visible: boolean;
  onClose: () => void;
  sellerId?: string;
  onVerificationComplete: (result: {
    success: boolean;
    sessionId: string;
    status: string;
    details?: DiditStatusResponse;
  }) => void;
}

export const DiditVerificationModal: React.FC<DiditVerificationModalProps> = ({
  visible,
  onClose,
  sellerId,
  onVerificationComplete,
}) => {
  const { colors } = useAppTheme();
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [verificationUrl, setVerificationUrl] = useState<string>("");
  const [status, setStatus] = useState<"PENDING" | "IN_REVIEW" | "APPROVED" | "DECLINED">("PENDING");
  const [statusDetails, setStatusDetails] = useState<DiditStatusResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startSession = useCallback(async () => {
    try {
      setLoadingSession(true);
      setErrorMsg("");
      const session = await createDiditVerificationSession({ sellerId });
      if (session?.verificationUrl && session?.sessionId) {
        setSessionId(session.sessionId);
        setVerificationUrl(session.verificationUrl);
        setStatus(session.status || "PENDING");
      } else {
        setErrorMsg("Unable to create Didit verification session. Please try again.");
      }
    } catch (err: any) {
      console.log("Didit session error:", err?.response?.data || err?.message);
      setErrorMsg(
        err?.response?.data?.message || "Failed to launch Didit verification session."
      );
    } finally {
      setLoadingSession(false);
    }
  }, [sellerId]);

  const pollStatus = useCallback(async (sId: string) => {
    if (!sId) return;
    try {
      const res = await fetchDiditVerificationStatus(sId);
      if (res?.success) {
        setStatusDetails(res);
        if (res.status === "APPROVED") {
          setStatus("APPROVED");
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          onVerificationComplete({
            success: true,
            sessionId: sId,
            status: "APPROVED",
            details: res,
          });
        } else if (res.status === "DECLINED") {
          setStatus("DECLINED");
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          onVerificationComplete({
            success: false,
            sessionId: sId,
            status: "DECLINED",
            details: res,
          });
        }
      }
    } catch (err) {
      console.log("Poll Didit status error:", err);
    }
  }, [onVerificationComplete]);

  useEffect(() => {
    if (visible) {
      startSession();
    } else {
      setSessionId("");
      setVerificationUrl("");
      setStatus("PENDING");
      setStatusDetails(null);
      setErrorMsg("");
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
  }, [visible, startSession]);

  useEffect(() => {
    if (visible && sessionId && status === "PENDING") {
      pollTimerRef.current = setInterval(() => {
        pollStatus(sessionId);
      }, 4000);
    }
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [visible, sessionId, status, pollStatus]);

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    const url = navState.url;
    if (url.includes("/didit/success") || url.includes("status=approved") || url.includes("callback/success")) {
      if (sessionId) {
        pollStatus(sessionId);
      }
    } else if (url.includes("/didit/decline") || url.includes("status=declined")) {
      setStatus("DECLINED");
      if (sessionId) {
        pollStatus(sessionId);
      }
    }
  };

  const isDocPassed = statusDetails?.documentVerified ?? false;
  const isLivenessPassed = statusDetails?.livenessPassed ?? false;
  const isFaceMatchPassed = statusDetails?.faceMatchPassed ?? false;
  const isIpPassed = statusDetails?.ipAddressVerified ?? false;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Icon name="close-outline" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Identity Verification</Text>
            <Text style={[styles.headerSubTitle, { color: colors.mutedText }]}>Powered by Didit Protocol</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Verification 4-Step Checklist Header Bar */}
        <View style={[styles.checklistCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.checklistTitle, { color: colors.text }]}>Verification Checklist</Text>
          <View style={styles.checklistRow}>
            <View style={styles.checkItem}>
              <Icon
                name={isDocPassed ? "checkmark-circle" : "document-text-outline"}
                size={16}
                color={isDocPassed ? "#10B981" : colors.mutedText}
              />
              <Text style={[styles.checkText, { color: isDocPassed ? "#10B981" : colors.mutedText }]}>
                1. Documents
              </Text>
            </View>

            <View style={styles.checkItem}>
              <Icon
                name={isLivenessPassed ? "checkmark-circle" : "videocam-outline"}
                size={16}
                color={isLivenessPassed ? "#10B981" : colors.mutedText}
              />
              <Text style={[styles.checkText, { color: isLivenessPassed ? "#10B981" : colors.mutedText }]}>
                2. Liveness
              </Text>
            </View>

            <View style={styles.checkItem}>
              <Icon
                name={isFaceMatchPassed ? "checkmark-circle" : "person-circle-outline"}
                size={16}
                color={isFaceMatchPassed ? "#10B981" : colors.mutedText}
              />
              <Text style={[styles.checkText, { color: isFaceMatchPassed ? "#10B981" : colors.mutedText }]}>
                3. Selfie Match
              </Text>
            </View>

            <View style={styles.checkItem}>
              <Icon
                name={isIpPassed ? "checkmark-circle" : "location-outline"}
                size={16}
                color={isIpPassed ? "#10B981" : colors.mutedText}
              />
              <Text style={[styles.checkText, { color: isIpPassed ? "#10B981" : colors.mutedText }]}>
                4. IP Check
              </Text>
            </View>
          </View>
        </View>

        {/* Content Area */}
        {loadingSession ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.text }]}>Starting Didit Verification Session...</Text>
            <Text style={[styles.loadingSubText, { color: colors.mutedText }]}>
              Preparing secure biometric and document scanner
            </Text>
          </View>
        ) : errorMsg ? (
          <View style={styles.centerContainer}>
            <Icon name="alert-circle-outline" size={48} color="#EF4444" />
            <Text style={[styles.errorTitle, { color: colors.text }]}>Session Error</Text>
            <Text style={[styles.errorText, { color: colors.mutedText }]}>{errorMsg}</Text>
            <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={startSession}>
              <Text style={styles.retryBtnText}>Retry Verification</Text>
            </TouchableOpacity>
          </View>
        ) : status === "APPROVED" ? (
          <View style={styles.centerContainer}>
            <Icon name="checkmark-circle" size={64} color="#10B981" />
            <Text style={[styles.successTitle, { color: colors.text }]}>Seller Identity Verified!</Text>
            <Text style={[styles.successBody, { color: colors.mutedText }]}>
              Your documents, liveness check, selfie match, and IP address were successfully verified with Didit.
            </Text>
            <TouchableOpacity style={[styles.doneBtn, { backgroundColor: colors.primary }]} onPress={onClose}>
              <Text style={styles.doneBtnText}>Continue Seller Setup</Text>
            </TouchableOpacity>
          </View>
        ) : status === "DECLINED" ? (
          <View style={styles.centerContainer}>
            <Icon name="close-circle-outline" size={64} color="#EF4444" />
            <Text style={[styles.errorTitle, { color: colors.text }]}>Verification Declined</Text>
            <Text style={[styles.errorText, { color: colors.mutedText }]}>
              Didit could not verify your identity documents or selfie match. Please ensure clear lighting and valid document images.
            </Text>
            <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={startSession}>
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : verificationUrl ? (
          <View style={styles.webViewWrap}>
            <WebView
              source={{ uri: verificationUrl }}
              onNavigationStateChange={handleNavigationStateChange}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={styles.webViewLoading}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              )}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback={true}
            />
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  closeBtn: {
    padding: 6,
  },
  headerTitleWrap: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  headerSubTitle: {
    fontSize: 11,
    fontWeight: "500",
  },
  checklistCard: {
    margin: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  checklistTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  checklistRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  checkItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  checkText: {
    fontSize: 11,
    fontWeight: "600",
  },
  webViewWrap: {
    flex: 1,
  },
  webViewLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 16,
  },
  loadingSubText: {
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 12,
  },
  errorText: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 16,
  },
  successBody: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  doneBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 24,
  },
  doneBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
