import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { submitCallFraudReport } from "../../utils/callApi";
import { getReadableApiErrorMessage } from "../../api/networkErrors";

export type FraudType =
  | "different_person"
  | "abusive_behaviour"
  | "no_response"
  | "premature_disconnect"
  | "other";

interface FraudOption {
  id: FraudType;
  label: string;
  description: string;
  icon: string;
}

const FRAUD_OPTIONS: FraudOption[] = [
  {
    id: "different_person",
    label: "Different Person on Call",
    description: "Seller identity mismatch — answered by another person.",
    icon: "person-remove-outline",
  },
  {
    id: "abusive_behaviour",
    label: "Abusive Behaviour",
    description: "Misconduct, rude language, or inappropriate conduct.",
    icon: "warning-outline",
  },
  {
    id: "no_response",
    label: "No Response",
    description: "Call receive karke bolna nahi — seller remains silent.",
    icon: "mic-off-outline",
  },
  {
    id: "premature_disconnect",
    label: "Premature Disconnect",
    description: "Time se pehle call katna — disconnected early.",
    icon: "call-outline",
  },
  {
    id: "other",
    label: "Other Fraud",
    description: "Custom detail input and timeline explanation.",
    icon: "alert-circle-outline",
  },
];

export interface CallReportModalProps {
  visible: boolean;
  callId: string;
  sellerId?: string;
  sellerName?: string;
  onClose: () => void;
  onReportSubmitted?: (reportData: any) => void;
}

export default function CallReportModal({
  visible,
  callId,
  sellerId = "",
  sellerName = "Seller",
  onClose,
  onReportSubmitted,
}: CallReportModalProps) {
  const [selectedType, setSelectedType] = useState<FraudType>("different_person");
  const [explanation, setExplanation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportResult, setReportResult] = useState<{
    status: "processing" | "confirmed" | "rejected" | "refunded";
    message: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const displayCallId = callId ? (callId.startsWith("CALL-") ? callId : `CALL-${callId.slice(-8).toUpperCase()}`) : "CALL-UNKNOWN";

  const handleSubmit = async () => {
    if (!callId) {
      setErrorMessage("Call ID is missing. Cannot submit report.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");

      const res = await submitCallFraudReport({
        callId,
        fraudType: selectedType,
        sellerId,
        explanation: explanation.trim(),
        reportTimestamp: new Date().toISOString(),
      });

      const nextStatus = res.status || "processing";
      const userNotice =
        res.message ||
        "Your report has been submitted and is currently under review. We are analyzing the call details and available evidence.";

      setReportResult({
        status: nextStatus,
        message: userNotice,
      });

      if (onReportSubmitted) {
        onReportSubmitted(res);
      }
    } catch (err: any) {
      const readable = getReadableApiErrorMessage(err, "Failed to submit fraud report.");
      setErrorMessage(readable);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setReportResult(null);
    setErrorMessage("");
    setExplanation("");
    setSelectedType("different_person");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleResetAndClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>Report Seller Call</Text>
              <View style={styles.callIdBadge}>
                <Icon name="shield-checkmark-outline" size={12} color="#7B4DFF" />
                <Text style={styles.callIdText}>{displayCallId}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={handleResetAndClose}>
              <Icon name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {reportResult ? (
            /* Result Feedback View */
            <View style={styles.resultContainer}>
              <View
                style={[
                  styles.resultIconWrap,
                  {
                    backgroundColor:
                      reportResult.status === "refunded" || reportResult.status === "confirmed"
                        ? "rgba(16, 185, 129, 0.14)"
                        : reportResult.status === "rejected"
                        ? "rgba(239, 68, 68, 0.14)"
                        : "rgba(123, 77, 255, 0.14)",
                  },
                ]}
              >
                <Icon
                  name={
                    reportResult.status === "refunded" || reportResult.status === "confirmed"
                      ? "checkmark-circle-outline"
                      : reportResult.status === "rejected"
                      ? "close-circle-outline"
                      : "hourglass-outline"
                  }
                  size={36}
                  color={
                    reportResult.status === "refunded" || reportResult.status === "confirmed"
                      ? "#10B981"
                      : reportResult.status === "rejected"
                      ? "#EF4444"
                      : "#7B4DFF"
                  }
                />
              </View>

              <Text style={styles.resultStatusTitle}>
                {reportResult.status === "refunded" || reportResult.status === "confirmed"
                  ? "Fraud Verified & Refunded"
                  : reportResult.status === "rejected"
                  ? "Report Closed"
                  : "Under AI Review / Processing"}
              </Text>

              <Text style={styles.resultStatusBody}>{reportResult.message}</Text>

              <TouchableOpacity style={styles.doneBtn} onPress={handleResetAndClose}>
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Form View */
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
              <Text style={styles.subtext}>
                Select the issue experienced during your call with <Text style={styles.boldText}>{sellerName}</Text>. Our Gemini AI engine will verify call recordings and evidence.
              </Text>

              {errorMessage ? (
                <View style={styles.errorCard}>
                  <Icon name="alert-circle-outline" size={16} color="#EF4444" />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              {/* Options */}
              <Text style={styles.sectionLabel}>Reason for report</Text>
              {FRAUD_OPTIONS.map((option) => {
                const isSelected = selectedType === option.id;

                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                    onPress={() => setSelectedType(option.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.optionIconWrap, isSelected && styles.optionIconWrapSelected]}>
                      <Icon name={option.icon} size={20} color={isSelected ? "#fff" : "#94A3B8"} />
                    </View>
                    <View style={styles.optionTextWrap}>
                      <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                        {option.label}
                      </Text>
                      <Text style={styles.optionDescription}>{option.description}</Text>
                    </View>
                    <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                      {isSelected ? <View style={styles.radioInner} /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* Explanation Input */}
              <Text style={styles.sectionLabel}>Additional details (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Provide any context or timeline of what happened..."
                placeholderTextColor="#64748B"
                multiline
                numberOfLines={3}
                value={explanation}
                onChangeText={setExplanation}
              />

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Icon name="shield-outline" size={18} color="#fff" />
                    <Text style={styles.submitBtnText}>Submit for AI Review</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.75)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#0F172A",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    maxHeight: "88%",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  headerTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "700",
  },
  callIdBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(123, 77, 255, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(123, 77, 255, 0.32)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  callIdText: {
    color: "#A78BFA",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollBody: {
    paddingBottom: 16,
  },
  subtext: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  boldText: {
    color: "#F1F5F9",
    fontWeight: "600",
  },
  sectionLabel: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 10,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  optionCardSelected: {
    borderColor: "#7B4DFF",
    backgroundColor: "rgba(123, 77, 255, 0.12)",
  },
  optionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  optionIconWrapSelected: {
    backgroundColor: "#7B4DFF",
  },
  optionTextWrap: {
    flex: 1,
  },
  optionLabel: {
    color: "#F1F5F9",
    fontSize: 14,
    fontWeight: "600",
  },
  optionLabelSelected: {
    color: "#DDD6FE",
  },
  optionDescription: {
    color: "#94A3B8",
    fontSize: 11.5,
    marginTop: 2,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#64748B",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  radioCircleSelected: {
    borderColor: "#7B4DFF",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#7B4DFF",
  },
  input: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 14,
    color: "#F8FAFC",
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    textAlignVertical: "top",
    minHeight: 80,
    marginBottom: 18,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#7B4DFF",
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.32)",
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 12.5,
    flex: 1,
  },
  resultContainer: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  resultIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  resultStatusTitle: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  resultStatusBody: {
    color: "#94A3B8",
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: "center",
    marginBottom: 20,
  },
  doneBtn: {
    backgroundColor: "#334155",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
  },
  doneBtnText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "600",
  },
});
