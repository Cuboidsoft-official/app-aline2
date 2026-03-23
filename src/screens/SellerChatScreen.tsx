import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { launchImageLibrary } from "react-native-image-picker";
import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  types,
  type DocumentPickerResponse,
} from "@react-native-documents/picker";
import { API, ROOT_API } from "../api/api";
import { socket } from "../socket";
import {
  getAttachmentDisplayName,
  getMessageAttachment,
  getMessageSenderId,
  getMessageText,
  isDocumentMessage,
  isImageMessage,
} from "../utils/chatPresentation";
import {
  formatPrimaryServicePrice,
  getPrimaryPricingOption,
  getServicePricingOptions,
} from "../utils/servicePricing";
import { uploadDocumentAsset, uploadImageAsset } from "../utils/uploadMedia";

const PRIMARY = "#7B4DFF";
const DEFAULT_AVATAR = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

type SellerProfile = {
  _id: string;
  user?: string | { _id?: string };
  sellerName?: string;
  profilePic?: string;
};

type AttachmentShape = {
  url?: string;
  fileName?: string;
  mimeType?: string;
  thumbnailUrl?: string;
};

type ChatMessage = {
  _id: string;
  text?: string;
  messageType?: string;
  attachment?: AttachmentShape;
  sender?: string | { _id?: string };
};

type SellerService = {
  _id: string;
  serviceName?: string;
  pricePerMin?: number;
  pricePerHour?: number;
  pricePerMsg?: number;
  pricePerSession?: number;
  packagePrice?: number;
  pricingModel?: string;
  pricingOptions?: Array<{
    model?: string;
    label?: string;
    amount?: number;
    isDefault?: boolean;
    durationMinutes?: number;
  }>;
  currency?: string;
  sessionDurationMinutes?: number;
};

type PickedDocument = {
  uri: string;
  name?: string | null;
  type?: string | null;
};

const getDocumentPickerMessage = (error: unknown): string => {
  if (!isErrorWithCode(error)) {
    return "Document pick failed";
  }

  switch (error.code) {
    case errorCodes.OPERATION_CANCELED:
      return "";
    case errorCodes.IN_PROGRESS:
      return "The document picker is already open.";
    case errorCodes.NULL_PRESENTER:
      return "Could not open the document picker right now.";
    case errorCodes.UNABLE_TO_OPEN_FILE_TYPE:
      return "This device could not open the document picker.";
    default:
      return error.message || "Document pick failed";
  }
};

const SellerChatScreen = ({ route, navigation }: any) => {
  const {
    sellerId,
    sellerUserId: initialSellerUserId,
    conversationId,
    serviceId,
    serviceName
  } = route.params || {};

  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(conversationId || null);
  const [services, setServices] = useState<SellerService[]>([]);
  const [selectedService, setSelectedService] = useState<SellerService | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const quickOptions = useMemo(
    () => [
      "I want to book",
      "What are your charges?",
      "Are you available?",
      "Please share the next steps"
    ],
    []
  );

  const sellerUserId = useMemo(() => {
    if (initialSellerUserId) {
      return initialSellerUserId;
    }

    if (!seller?.user) {
      return null;
    }

    return typeof seller.user === "string" ? seller.user : seller.user._id || null;
  }, [initialSellerUserId, seller]);

  const fetchSeller = useCallback(async () => {
    const token = await AsyncStorage.getItem("token");
    const res = await API.get(`/seller/${sellerId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setSeller(res.data.seller);
    return res.data.seller as SellerProfile;
  }, [sellerId]);

  const fetchServices = useCallback(async () => {
    const token = await AsyncStorage.getItem("token");
    const res = await API.get(`/service/seller/${sellerId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const nextServices = res.data.services || [];
    setServices(nextServices);

    if (serviceId) {
      const matchedService = nextServices.find((item: SellerService) => item._id === serviceId) || null;
      setSelectedService(matchedService);
    } else if (nextServices.length > 0) {
      setSelectedService(nextServices[0]);
    }
  }, [sellerId, serviceId]);

  const fetchMessages = useCallback(async (targetConversationId: string) => {
    const token = await AsyncStorage.getItem("token");
    const res = await API.get(`/message/${targetConversationId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setMessages(res.data.messages || []);
  }, []);

  const ensureConversation = useCallback(async () => {
    if (currentConversationId) {
      return currentConversationId;
    }

    if (!sellerUserId) {
      return null;
    }

    const res = await ROOT_API.post("/chat/create", {
      receiverId: sellerUserId,
      conversationType: "seller",
      serviceId: selectedService?._id || serviceId || undefined
    });

    const nextConversationId = res?.data?.conversation?._id || null;

    if (nextConversationId) {
      setCurrentConversationId(nextConversationId);
    }

    return nextConversationId;
  }, [currentConversationId, sellerUserId, selectedService?._id, serviceId]);

  const appendMessage = useCallback((nextMessage: ChatMessage) => {
    setMessages((prev) => {
      const exists = prev.some((item) => item._id === nextMessage._id);
      return exists ? prev : [...prev, nextMessage];
    });
  }, []);

  const submitMessage = useCallback(async (payload: Record<string, unknown>) => {
    const resolvedConversationId = await ensureConversation();

    if (!resolvedConversationId) {
      Alert.alert("Unavailable", "Seller chat is not ready yet for this profile.");
      return;
    }

    const token = await AsyncStorage.getItem("token");
    const res = await API.post(
      "/message/send",
      {
        conversationId: resolvedConversationId,
        ...payload
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const nextMessage = res.data.message as ChatMessage;
    appendMessage(nextMessage);

    socket.emit("sendMessage", {
      conversationId: resolvedConversationId,
      message: nextMessage
    });
  }, [appendMessage, ensureConversation]);

  const sendMessage = useCallback(async (msgText = text) => {
    if (!msgText.trim() || sending) {
      return;
    }

    try {
      setSending(true);
      await submitMessage({
        text: msgText.trim(),
        messageType: "text"
      });
      setText("");
    } catch (error) {
      console.log("seller chat send error:", error);
      Alert.alert("Error", "Failed to send message");
    } finally {
      setSending(false);
    }
  }, [sending, submitMessage, text]);

  const sendBookingRequest = useCallback(async () => {
    const targetService = selectedService;

    if (!targetService) {
      return;
    }

    try {
      const resolvedConversationId = await ensureConversation();
      const pricingModel = getPrimaryPricingOption(targetService)?.model;
      const res = await API.post("/service-requests", {
        serviceId: targetService._id,
        conversationId: resolvedConversationId || undefined,
        pricingModel,
        note: text.trim() || `Request for ${targetService.serviceName || serviceName || "service"}`
      });

      if (res?.data?.systemMessage) {
        appendMessage(res.data.systemMessage as ChatMessage);
        if (resolvedConversationId) {
          socket.emit("sendMessage", {
            conversationId: resolvedConversationId,
            message: res.data.systemMessage
          });
        }
      }

      setShowPaymentModal(false);
      setText("");
      Alert.alert("Request Created", "The service request has been sent to the seller.");
    } catch (error: any) {
      console.log("seller booking request error:", error?.response?.data || error);
      Alert.alert("Error", error?.response?.data?.message || "Failed to create service request");
    }
  }, [appendMessage, ensureConversation, selectedService, serviceName, text]);

  const sendImageAttachment = useCallback(async () => {
    launchImageLibrary(
      {
        mediaType: "photo",
        selectionLimit: 1
      },
      async (response) => {
        if (response?.didCancel) return;
        if (response?.errorCode) {
          Alert.alert("Error", "Image pick failed");
          return;
        }

        const asset = response.assets?.[0];
        if (!asset?.uri) {
          return;
        }

        try {
          setUploading(true);
          const url = await uploadImageAsset({
            uri: asset.uri,
            fileName: asset.fileName,
            type: asset.type,
          });

          await submitMessage({
            messageType: "image",
            text: text.trim(),
            attachment: {
              url,
              fileName: asset.fileName,
              mimeType: asset.type || "image/jpeg",
            }
          });
          setText("");
        } catch (error) {
          console.log("seller image send error:", error);
          Alert.alert("Error", "Failed to send image");
        } finally {
          setUploading(false);
        }
      }
    );
  }, [submitMessage, text]);

  const normalizePickedDocument = useCallback(async (file: DocumentPickerResponse): Promise<PickedDocument> => {
    const fileName = file.name || `document_${Date.now()}`;

    if (file.isVirtual || String(file.uri || "").startsWith("content://")) {
      const [localCopy] = await keepLocalCopy({
        destination: "cachesDirectory",
        files: [
          {
            uri: file.uri,
            fileName,
            convertVirtualFileToType: file.convertibleToMimeTypes?.[0]?.mimeType,
          },
        ],
      });

      if (!localCopy || localCopy.status !== "success") {
        throw new Error(localCopy?.copyError || "Unable to access the selected document.");
      }

      return {
        uri: localCopy.localUri,
        name: fileName,
        type: file.type,
      };
    }

    return {
      uri: file.uri,
      name: fileName,
      type: file.type,
    };
  }, []);

  const sendDocumentAttachment = useCallback(async () => {
    try {
      const [file] = await pick({
        mode: "import",
        allowMultiSelection: false,
        type: [types.images, types.pdf]
      });

      if (!file?.uri) {
        return;
      }

      const normalizedFile = await normalizePickedDocument(file);
      setUploading(true);
      const url = await uploadDocumentAsset(normalizedFile);

      await submitMessage({
        messageType: "document",
        text: text.trim(),
        attachment: {
          url,
          fileName: normalizedFile.name,
          mimeType: normalizedFile.type || "application/octet-stream",
        }
      });
      setText("");
    } catch (error) {
      const message = getDocumentPickerMessage(error);
      if (!message) {
        return;
      }

      console.log("seller document send error:", error);
      Alert.alert("Error", message);
    } finally {
      setUploading(false);
    }
  }, [normalizePickedDocument, submitMessage, text]);

  useEffect(() => {
    let mounted = true;

    const loadCurrentUser = async () => {
      try {
        const rawUser = await AsyncStorage.getItem("user");
        const parsedUser = rawUser ? JSON.parse(rawUser) : null;
        const nextUserId = parsedUser?._id || parsedUser?.id || "";

        if (!mounted) {
          return;
        }

        setCurrentUserId(nextUserId);

        if (nextUserId) {
          socket.emit("userOnline", nextUserId);
        }
      } catch (error) {
        console.log("seller chat current user load error:", error);
      }
    };

    loadCurrentUser();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const initializeChat = async () => {
      try {
        setLoading(true);
        await Promise.all([fetchSeller(), fetchServices()]);
        const resolvedConversationId = await ensureConversation();

        if (active && resolvedConversationId) {
          await fetchMessages(resolvedConversationId);
          socket.emit("joinConversation", resolvedConversationId);
        }
      } catch (error) {
        console.log("seller chat init error:", error);
        if (active) {
          Alert.alert("Error", "Failed to load seller chat");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    initializeChat();

    return () => {
      active = false;
    };
  }, [ensureConversation, fetchMessages, fetchSeller, fetchServices]);

  useEffect(() => {
    const handleReceiveMessage = (msg: ChatMessage) => {
      appendMessage(msg);
    };

    socket.on("receiveMessage", handleReceiveMessage);

    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
    };
  }, [appendMessage]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = String(getMessageSenderId(item)) === String(currentUserId || "");
    const attachment = getMessageAttachment(item);
    const textValue = getMessageText(item);

    return (
      <View
        style={[
          styles.msgRow,
          { justifyContent: isMine ? "flex-end" : "flex-start" }
        ]}
      >
        <View
          style={[
            styles.msgBubble,
            isMine ? styles.myMsg : styles.otherMsg
          ]}
        >
          {isImageMessage(item) && attachment?.url ? (
            <Image source={{ uri: attachment.url }} style={styles.messageImage} />
          ) : null}

          {isDocumentMessage(item) && attachment?.url ? (
            <View style={styles.attachmentRow}>
              <Icon
                name="document-text-outline"
                size={20}
                color={isMine ? "#fff" : PRIMARY}
              />
              <Text
                style={[styles.attachmentName, isMine ? styles.myText : styles.otherText]}
                numberOfLines={1}
              >
                {getAttachmentDisplayName(item)}
              </Text>
            </View>
          ) : null}

          {!!textValue && (
            <Text style={isMine ? styles.myText : styles.otherText}>
              {textValue}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const selectedPricing = getPrimaryPricingOption(selectedService);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.centerHeader}
          onPress={() =>
            navigation.navigate("SellerDetailsScreen", { sellerId })
          }
        >
          <Image
            source={{
              uri: seller?.profilePic || DEFAULT_AVATAR
            }}
            style={styles.avatar}
          />

          <View style={{ marginLeft: 8 }}>
            <Text style={styles.name}>
              {seller?.sellerName || "Loading..."}
            </Text>
            <Text style={styles.status}>Chat for service requests</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.rightIcons}>
          <TouchableOpacity
            style={{ marginRight: 15 }}
            onPress={() => Alert.alert("Not available yet", "Voice calling is not implemented yet.")}
          >
            <Icon name="call" size={20} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => Alert.alert("Not available yet", "Video calling is not implemented yet.")}
          >
            <Icon name="videocam" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.premiumServiceWrap}>
        <Text style={styles.premiumTitle}>Available Services</Text>

        <FlatList
          horizontal
          data={services}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ paddingHorizontal: 10 }}
          renderItem={({ item }: { item: SellerService }) => {
            const isSelected = selectedService?._id === item._id;
            const extraOptions = getServicePricingOptions(item).slice(1, 3);

            return (
              <TouchableOpacity
                style={[
                  styles.premiumCard,
                  isSelected && styles.selectedCard
                ]}
                onPress={() => setSelectedService(item)}
              >
                <Text
                  style={[
                    styles.serviceName,
                    isSelected && { color: "#fff" }
                  ]}
                >
                  {item.serviceName}
                </Text>

                <Text
                  style={[
                    styles.servicePrice,
                    isSelected && { color: "#fff" }
                  ]}
                >
                  {formatPrimaryServicePrice(item)}
                </Text>

                {!!extraOptions.length && (
                  <Text
                    style={[
                      styles.serviceSubMeta,
                      isSelected && { color: "#E9DEFF" }
                    ]}
                  >
                    {extraOptions.map((option: { label?: string }) => option.label).join(" • ")}
                  </Text>
                )}

                {isSelected && (
                  <TouchableOpacity
                    style={styles.bookNowBtn}
                    onPress={() => setShowPaymentModal(true)}
                  >
                    <Text style={styles.bookNowText}>Request in Chat</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={PRIMARY} />
          </View>
        ) : (
          <FlatList
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item, index) => item._id || index.toString()}
            contentContainerStyle={{ padding: 12, paddingBottom: 132 }}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptyText}>
                  Start the conversation here. Booking requests are handled through chat.
                </Text>
              </View>
            }
          />
        )}

        <View style={styles.quickContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {quickOptions.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.quickChip}
                onPress={() => {
                  sendMessage(item).catch((error) => {
                    console.log("seller quick reply error:", error);
                  });
                }}
              >
                <Text style={styles.quickText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      <View style={styles.inputWrap}>
        <TouchableOpacity onPress={sendImageAttachment} disabled={uploading || loading}>
          <Icon name="image-outline" size={22} color={PRIMARY} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.attachButton} onPress={sendDocumentAttachment} disabled={uploading || loading}>
          <Icon name="document-outline" size={22} color={PRIMARY} />
        </TouchableOpacity>

        <TextInput
          placeholder={uploading ? "Uploading attachment..." : "Message..."}
          value={text}
          onChangeText={setText}
          style={styles.input}
          editable={!loading && !sending && !uploading}
        />

        {uploading ? (
          <ActivityIndicator color={PRIMARY} />
        ) : text.trim() ? (
          <TouchableOpacity
            style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
            onPress={() => {
              sendMessage().catch((error) => {
                console.log("seller chat send error:", error);
              });
            }}
            disabled={sending || loading}
          >
            <Icon name="send" size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <Icon name="mic-outline" size={24} color={PRIMARY} />
        )}
      </View>

      <Modal visible={showPaymentModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Request Service in Chat</Text>

            <Text style={styles.modalService}>
              {selectedService?.serviceName || serviceName || "Selected service"}
            </Text>

            <Text style={styles.modalPrice}>
              {selectedPricing ? formatPrimaryServicePrice(selectedService) : "Pricing unavailable"}
            </Text>

            {!!selectedPricing?.durationMinutes && (
              <Text style={styles.modalDuration}>
                Duration: {selectedPricing.durationMinutes} min
              </Text>
            )}

            <Text style={styles.modalNote}>
              Payments and appointment scheduling are not implemented in the backend yet. This will send a structured booking request message to the seller instead.
            </Text>

            <TouchableOpacity style={styles.payBtn} onPress={() => {
              sendBookingRequest().catch((error) => {
                console.log("seller booking request error:", error);
              });
            }}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                Send Request
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
              <Text style={{ marginTop: 10, color: "#777" }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default SellerChatScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5FA" },
  header: {
    backgroundColor: PRIMARY,
    paddingTop: StatusBar.currentHeight || 40,
    paddingBottom: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  centerHeader: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginLeft: 10
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19
  },
  name: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15
  },
  status: {
    color: "#E5D9FF",
    fontSize: 11
  },
  rightIcons: {
    flexDirection: "row",
    alignItems: "center"
  },
  premiumServiceWrap: {
    backgroundColor: "#fff",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#eee"
  },
  premiumTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 12,
    marginBottom: 6
  },
  premiumCard: {
    width: 188,
    backgroundColor: "#fafafa",
    padding: 12,
    borderRadius: 16,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#eee"
  },
  selectedCard: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY
  },
  serviceName: { fontWeight: "700", fontSize: 13 },
  servicePrice: {
    marginTop: 5,
    fontSize: 14,
    fontWeight: "700",
    color: PRIMARY
  },
  serviceSubMeta: {
    marginTop: 6,
    fontSize: 11.5,
    color: "#666"
  },
  bookNowBtn: {
    marginTop: 10,
    backgroundColor: "#fff",
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: "center"
  },
  bookNowText: {
    color: PRIMARY,
    fontWeight: "700",
    fontSize: 12
  },
  loaderWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 60
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111"
  },
  emptyText: {
    marginTop: 8,
    textAlign: "center",
    color: "#666"
  },
  msgRow: { marginVertical: 5 },
  msgBubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: "80%"
  },
  myMsg: { backgroundColor: PRIMARY },
  otherMsg: { backgroundColor: "#fff" },
  myText: { color: "#fff" },
  otherText: { color: "#111" },
  messageImage: {
    width: 220,
    height: 220,
    borderRadius: 12,
    marginBottom: 8
  },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6
  },
  attachmentName: {
    marginLeft: 8,
    fontWeight: "600",
    maxWidth: 180
  },
  quickContainer: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    paddingVertical: 6,
    paddingLeft: 10,
    backgroundColor: "#F4F5FA"
  },
  quickChip: {
    backgroundColor: "#EDE9FF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10
  },
  quickText: { color: PRIMARY, fontWeight: "600" },
  inputWrap: {
    flexDirection: "row",
    padding: 10,
    backgroundColor: "#fff",
    alignItems: "center"
  },
  attachButton: {
    marginLeft: 10,
    marginRight: 10
  },
  input: {
    flex: 1,
    backgroundColor: "#F1F1F4",
    borderRadius: 25,
    paddingHorizontal: 15,
    minHeight: 44
  },
  sendBtn: {
    backgroundColor: PRIMARY,
    padding: 10,
    borderRadius: 20,
    marginLeft: 8
  },
  sendBtnDisabled: {
    opacity: 0.6
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center"
  },
  modalBox: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 22,
    alignItems: "center"
  },
  modalTitle: { fontSize: 16, fontWeight: "700" },
  modalService: { marginTop: 10, fontWeight: "600" },
  modalPrice: { marginTop: 6, color: PRIMARY, fontWeight: "700" },
  modalDuration: {
    marginTop: 4,
    color: "#666",
    fontSize: 12
  },
  modalNote: {
    marginTop: 10,
    fontSize: 12,
    color: "#777",
    textAlign: "center"
  },
  payBtn: {
    marginTop: 14,
    backgroundColor: PRIMARY,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 12
  }
});
