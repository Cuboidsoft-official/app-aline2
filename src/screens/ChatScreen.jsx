import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  TextInput,
  TouchableOpacity,
  ImageBackground,
  Modal,
  SafeAreaView,
  StatusBar,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { launchCamera, launchImageLibrary } from "react-native-image-picker";
import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  types,
} from "@react-native-documents/picker";
import { API } from "../api/api";
import { connectSocket, socket } from "../socket";
import {
  getAttachmentDisplayName,
  getMessageAttachment,
  getMessageSenderId,
  getMessageText,
  isAudioMessage,
  isDocumentMessage,
  isImageMessage,
  isVideoMessage,
} from "../utils/chatPresentation";
import {
  createChatConversation,
  fetchConversationMessages,
  sendChatMessage,
} from "../utils/chatApi";
import {
  getLastIncomingUnseenMessage,
  mergeMessageReaction,
  mergeMessageSeen,
} from "../utils/chatRealtime";

const DEFAULT_AVATAR = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
const PRIMARY = "#7b3fe4";

const getDocumentPickerMessage = (error) => {
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

const getRequestErrorMessage = (error, fallbackMessage) =>
  error?.response?.data?.message || error?.message || fallbackMessage;

const ChatScreen = ({ navigation, route }) => {
  const { userId, conversationId, conversationType = "direct", serviceId } = route.params || {};
  const [user, setUser] = useState(null);
  const [text, setText] = useState("");
  const [showTools, setShowTools] = useState(false);
  const [messages, setMessages] = useState([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentConversationId, setCurrentConversationId] = useState(conversationId || null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState({ nextCursor: null, hasMore: false, limit: 30 });
  const [typingUserId, setTypingUserId] = useState("");
  const typingTimeoutRef = useRef(null);

  const fetchUser = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      const res = await API.get(`/auth/user/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(res.data.user);
    } catch (err) {
      console.log("User fetch error:", err?.response?.data || err);
    }
  }, [userId]);

  const mergeMessage = useCallback((nextMessage) => {
    setMessages((prev) => {
      const exists = prev.find((item) => item._id === nextMessage?._id);
      if (exists) {
        return prev;
      }
      return [...prev, nextMessage];
    });
  }, []);

  const applyMessageSeen = useCallback((payload) => {
    setMessages((prev) => mergeMessageSeen(prev, payload));
  }, []);

  const applyMessageReaction = useCallback((payload) => {
    setMessages((prev) => mergeMessageReaction(prev, payload));
  }, []);

  const fetchMessages = useCallback(async (targetConversationId = currentConversationId, options = {}) => {
    if (!targetConversationId) {
      return;
    }

    try {
      const data = await fetchConversationMessages(targetConversationId, {
        cursor: options.cursor,
        limit: options.limit || 30,
      });
      const nextMessages = data?.messages || [];
      setPagination(data?.pagination || { nextCursor: null, hasMore: false, limit: 30 });
      setMessages((prev) => (options.append ? [...nextMessages, ...prev] : nextMessages));
    } catch (err) {
      console.log("Fetch messages error:", err?.response?.data || err);
    }
  }, [currentConversationId]);

  const ensureConversation = useCallback(async () => {
    if (currentConversationId) {
      return currentConversationId;
    }

    if (!userId) {
      return null;
    }

    try {
      const res = await createChatConversation({
        receiverId: userId,
        conversationType,
        serviceId,
      });

      const nextConversationId = res?.conversation?._id || null;
      if (nextConversationId) {
        setCurrentConversationId(nextConversationId);
      }
      return nextConversationId;
    } catch (err) {
      console.log("Ensure conversation error:", err?.response?.data || err);
      return null;
    }
  }, [conversationType, currentConversationId, serviceId, userId]);

  useEffect(() => {
    setCurrentConversationId(conversationId || null);
  }, [conversationId]);

  useEffect(() => {
    let mounted = true;
    const loadCurrentUser = async () => {
      try {
        const rawUser = await AsyncStorage.getItem("user");
        const parsedUser = rawUser ? JSON.parse(rawUser) : null;
        const nextUserId = parsedUser?._id || parsedUser?.id || "";

        if (mounted) {
          setCurrentUserId(nextUserId);
        }

        if (nextUserId) {
          await connectSocket();
          socket.emit("userOnline", nextUserId);
        }
      } catch (err) {
        console.log("Current user load error:", err);
      }
    };

    loadCurrentUser();
    return () => {
      mounted = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (currentConversationId) {
        fetchMessages(currentConversationId);
      }
    }, [currentConversationId, fetchMessages])
  );

  useEffect(() => {
    const handleReceiveMessage = (message) => {
      mergeMessage(message);
    };

    const handleTyping = (data) => {
      const nextUserId = String(data?.userId || "");
      if (nextUserId && nextUserId !== String(currentUserId || "")) {
        setTypingUserId(nextUserId);
      }
    };

    const handleStopTyping = (data) => {
      const nextUserId = String(data?.userId || "");
      setTypingUserId((prev) => (prev === nextUserId ? "" : prev));
    };

    const handleMessageSeen = (data) => {
      applyMessageSeen(data);
    };

    const handleMessageReaction = (data) => {
      applyMessageReaction(data);
    };

    socket.on("receiveMessage", handleReceiveMessage);
    socket.on("typing", handleTyping);
    socket.on("stopTyping", handleStopTyping);
    socket.on("messageSeen", handleMessageSeen);
    socket.on("messageReaction", handleMessageReaction);
    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
      socket.off("typing", handleTyping);
      socket.off("stopTyping", handleStopTyping);
      socket.off("messageSeen", handleMessageSeen);
      socket.off("messageReaction", handleMessageReaction);
    };
  }, [applyMessageReaction, applyMessageSeen, currentUserId, mergeMessage]);

  useEffect(() => {
    let active = true;
    const initializeChat = async () => {
      if (userId) {
        await fetchUser();
      }

      const resolvedConversationId = await ensureConversation();

      if (active && resolvedConversationId) {
        await fetchMessages(resolvedConversationId);
        await connectSocket();
        socket.emit("joinConversation", resolvedConversationId);
      }
    };

    initializeChat();
    return () => {
      active = false;
    };
  }, [ensureConversation, fetchMessages, fetchUser, userId]);

  useEffect(() => {
    if (!currentConversationId) {
      return;
    }

    const joinConversation = async () => {
      await connectSocket();
      socket.emit("joinConversation", currentConversationId);
    };

    joinConversation().catch((error) => {
      console.log("Join conversation error:", error);
    });
  }, [currentConversationId]);

  const submitMessage = useCallback(async ({ text: nextText, file }) => {
    const resolvedConversationId = await ensureConversation();
    if (!resolvedConversationId) {
      Alert.alert("Unavailable", "This conversation is not ready yet.");
      return;
    }

    const res = await sendChatMessage({
      conversationId: resolvedConversationId,
      text: nextText,
      file,
    });

    if (res?.message) {
      mergeMessage(res.message);
      await connectSocket();
      socket.emit("sendMessage", {
        conversationId: resolvedConversationId,
        message: res.message
      });
    }
  }, [ensureConversation, mergeMessage]);

  const sendTextMessage = useCallback(async () => {
    if (!text.trim() || sending) {
      return;
    }

    try {
      setSending(true);
      await submitMessage({ text: text.trim() });
      setText("");
    } catch (err) {
      console.log("Send message error:", err?.response?.data || err);
      Alert.alert("Error", getRequestErrorMessage(err, "Failed to send message"));
    } finally {
      setSending(false);
    }
  }, [sending, submitMessage, text]);

  const sendImageAttachment = useCallback(async () => {
    launchImageLibrary(
      {
        mediaType: "mixed",
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
          await submitMessage({
            text: text.trim(),
            file: {
              uri: asset.uri,
              name: asset.fileName || `media_${Date.now()}`,
              type: asset.type || "application/octet-stream",
            }
          });
          setText("");
          setShowTools(false);
        } catch (error) {
          console.log("image message send error:", error);
          Alert.alert("Error", getRequestErrorMessage(error, "Failed to send attachment"));
        } finally {
          setUploading(false);
        }
      }
    );
  }, [submitMessage, text]);

  const sendCameraAttachment = useCallback(async () => {
    launchCamera(
      {
        mediaType: "mixed",
        saveToPhotos: false,
        videoQuality: "high",
      },
      async (response) => {
        if (response?.didCancel) return;
        if (response?.errorCode) {
          Alert.alert("Error", response.errorMessage || "Camera capture failed");
          return;
        }

        const asset = response.assets?.[0];
        if (!asset?.uri) {
          return;
        }

        try {
          setUploading(true);
          await submitMessage({
            text: text.trim(),
            file: {
              uri: asset.uri,
              name: asset.fileName || `camera_${Date.now()}`,
              type: asset.type || "application/octet-stream",
            }
          });
          setText("");
          setShowTools(false);
        } catch (error) {
          console.log("camera message send error:", error);
          Alert.alert("Error", getRequestErrorMessage(error, "Failed to send camera capture"));
        } finally {
          setUploading(false);
        }
      }
    );
  }, [submitMessage, text]);

  const sendDocumentAttachment = useCallback(async () => {
    try {
      const [file] = await pick({
        mode: "import",
        allowMultiSelection: false,
        type: [types.allFiles]
      });

      if (!file?.uri) {
        return;
      }

      let localUri = file.uri;
      if (file.isVirtual || String(file.uri || "").startsWith("content://")) {
        const [localCopy] = await keepLocalCopy({
          destination: "cachesDirectory",
          files: [
            {
              uri: file.uri,
              fileName: file.name || `document_${Date.now()}`,
              convertVirtualFileToType: file.convertibleToMimeTypes?.[0]?.mimeType,
            },
          ],
        });

        if (!localCopy || localCopy.status !== "success") {
          throw new Error(localCopy?.copyError || "Unable to access the selected document.");
        }

        localUri = localCopy.localUri;
      }

      setUploading(true);
      await submitMessage({
        text: text.trim(),
        file: {
          uri: localUri,
          name: file.name || `document_${Date.now()}`,
          type: file.type || "application/octet-stream",
        }
      });
      setText("");
      setShowTools(false);
    } catch (error) {
      const message = getDocumentPickerMessage(error) || getRequestErrorMessage(error, "Document pick failed");
      if (!message) {
        return;
      }

      console.log("document message send error:", error);
      Alert.alert("Error", message);
    } finally {
      setUploading(false);
    }
  }, [submitMessage, text]);

  const sendAudioAttachment = useCallback(async () => {
    try {
      const [file] = await pick({
        mode: "import",
        allowMultiSelection: false,
        type: [types.audio]
      });

      if (!file?.uri) {
        return;
      }

      let localUri = file.uri;
      if (file.isVirtual || String(file.uri || "").startsWith("content://")) {
        const [localCopy] = await keepLocalCopy({
          destination: "cachesDirectory",
          files: [
            {
              uri: file.uri,
              fileName: file.name || `audio_${Date.now()}`,
              convertVirtualFileToType: file.convertibleToMimeTypes?.[0]?.mimeType,
            },
          ],
        });

        if (!localCopy || localCopy.status !== "success") {
          throw new Error(localCopy?.copyError || "Unable to access the selected audio file.");
        }

        localUri = localCopy.localUri;
      }

      setUploading(true);
      await submitMessage({
        text: text.trim(),
        file: {
          uri: localUri,
          name: file.name || `audio_${Date.now()}`,
          type: file.type || "audio/*",
        }
      });
      setText("");
      setShowTools(false);
    } catch (error) {
      const message = getDocumentPickerMessage(error) || getRequestErrorMessage(error, "Audio pick failed");
      if (!message) {
        return;
      }

      console.log("audio message send error:", error);
      Alert.alert("Error", message);
    } finally {
      setUploading(false);
    }
  }, [submitMessage, text]);

  const tools = useMemo(() => [
    { id: "gallery", name: "Gallery", icon: "image", action: sendImageAttachment },
    { id: "document", name: "Document", icon: "document", action: sendDocumentAttachment },
    {
      id: "camera",
      name: "Camera",
      icon: "camera",
      action: sendCameraAttachment,
    },
    {
      id: "audio",
      name: "Audio",
      icon: "musical-notes",
      action: sendAudioAttachment,
    },
    {
      id: "gif",
      name: "GIF",
      icon: "happy",
      action: () => Alert.alert("Not available yet", "GIF search is not implemented yet."),
    },
    {
      id: "location",
      name: "Location",
      icon: "location",
      action: () => Alert.alert("Not available yet", "Location sharing is not implemented yet."),
    },
  ], [sendAudioAttachment, sendCameraAttachment, sendDocumentAttachment, sendImageAttachment]);

  const loadMoreMessages = useCallback(async () => {
    if (!currentConversationId || !pagination?.hasMore || !pagination?.nextCursor || loadingMore) {
      return;
    }

    try {
      setLoadingMore(true);
      await fetchMessages(currentConversationId, {
        append: true,
        cursor: pagination.nextCursor,
        limit: pagination.limit || 30,
      });
    } finally {
      setLoadingMore(false);
    }
  }, [currentConversationId, fetchMessages, loadingMore, pagination]);

  const handleTextChange = useCallback((value) => {
    setText(value);

    if (!currentConversationId) {
      return;
    }

    connectSocket()
      .then(() => {
        socket.emit("typing", { conversationId: currentConversationId });
      })
      .catch((error) => {
        console.log("Typing emit error:", error);
      });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("stopTyping", { conversationId: currentConversationId });
    }, 1200);
  }, [currentConversationId]);

  useEffect(() => () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!currentConversationId || !currentUserId || !messages.length) {
      return;
    }

    const nextMessage = getLastIncomingUnseenMessage(messages, currentUserId);
    if (!nextMessage?._id) {
      return;
    }

    connectSocket()
      .then(() => {
        socket.emit("messageSeen", {
          conversationId: currentConversationId,
          messageId: nextMessage._id,
        });
        applyMessageSeen({
          messageId: nextMessage._id,
          userId: currentUserId,
          seenAt: new Date().toISOString(),
        });
      })
      .catch((error) => {
        console.log("Message seen emit error:", error);
      });
  }, [applyMessageSeen, currentConversationId, currentUserId, messages]);

  const reactToMessage = useCallback((messageId, emoji = "❤️") => {
    if (!currentConversationId || !messageId) {
      return;
    }

    connectSocket()
      .then(() => {
        socket.emit("reactMessage", {
          conversationId: currentConversationId,
          messageId,
          emoji,
        });
        applyMessageReaction({
          messageId,
          userId: currentUserId,
          emoji,
        });
      })
      .catch((error) => {
        console.log("Message reaction emit error:", error);
      });
  }, [applyMessageReaction, currentConversationId, currentUserId]);

  const renderMessage = ({ item }) => {
    const isMine = String(getMessageSenderId(item)) === String(currentUserId || "");
    const attachment = getMessageAttachment(item);
    const textValue = getMessageText(item);
    const seenCount = Array.isArray(item?.seenBy) ? item.seenBy.length : 0;
    const reactions = Array.isArray(item?.reactions) ? item.reactions : [];

    return (
      <View
        style={[
          styles.messageRow,
          isMine ? { justifyContent: "flex-end" } : { justifyContent: "flex-start" }
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.92}
          onLongPress={() => reactToMessage(item?._id)}
          style={[
            styles.messageBubble,
            isMine ? styles.myMessage : styles.otherMessage
          ]}
        >
          {isImageMessage(item) && attachment?.url ? (
            <Image source={{ uri: attachment.url }} style={styles.messageImage} />
          ) : null}

          {isVideoMessage(item) && (attachment?.thumbnailUrl || attachment?.url) ? (
            <View style={styles.documentCard}>
              <Image
                source={{ uri: attachment.thumbnailUrl || attachment.url }}
                style={styles.messageImage}
              />
              <Text style={[styles.documentName, isMine && styles.myDocumentName]} numberOfLines={1}>
                Video attachment
              </Text>
            </View>
          ) : null}

          {isAudioMessage(item) && attachment?.url ? (
            <View style={styles.documentCard}>
              <Icon name="musical-notes-outline" size={20} color={isMine ? "#fff" : PRIMARY} />
              <Text style={[styles.documentName, isMine && styles.myDocumentName]} numberOfLines={1}>
                {getAttachmentDisplayName(item)}
              </Text>
            </View>
          ) : null}

          {isDocumentMessage(item) && attachment?.url ? (
            <View style={styles.documentCard}>
              <Icon name="document-text-outline" size={20} color={isMine ? "#fff" : PRIMARY} />
              <Text style={[styles.documentName, isMine && styles.myDocumentName]} numberOfLines={1}>
                {getAttachmentDisplayName(item)}
              </Text>
            </View>
          ) : null}

          {!!textValue && (
            <Text style={[styles.messageText, isMine && styles.myMessageText]}>
              {textValue}
            </Text>
          )}

          {!!reactions.length && (
            <View style={styles.reactionRow}>
              {reactions.map((reaction) => (
                <View
                  key={`${item?._id || "message"}-${reaction?.emoji || "reaction"}`}
                  style={[styles.reactionChip, isMine && styles.myReactionChip]}
                >
                  <Text style={styles.reactionText}>
                    {reaction?.emoji} {Array.isArray(reaction?.users) ? reaction.users.length : 0}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {isMine && seenCount > 0 ? (
            <Text style={styles.seenText}>Seen</Text>
          ) : null}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar backgroundColor={PRIMARY} barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.userInfo}
          activeOpacity={0.7}
          onPress={() => navigation.navigate("ChatDetailsScreen", { userId, conversationId: currentConversationId })}
        >
          <Image
            source={{
              uri: user?.profilePic || DEFAULT_AVATAR
            }}
            style={styles.avatar}
          />

          <View>
            <Text style={styles.username}>
              {user?.username || user?.name || "Loading..."}
            </Text>
            <Text style={styles.status}>{typingUserId ? "Typing..." : "Conversation"}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.headerIcons}>
          <TouchableOpacity style={{ marginRight: 15 }} onPress={() => Alert.alert("Not available yet", "Video calling is not implemented yet.")}>
            <Icon name="videocam" size={22} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity style={{ marginRight: 15 }} onPress={() => Alert.alert("Not available yet", "Voice calling is not implemented yet.")}>
            <Icon name="call" size={20} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity>
            <Icon name="ellipsis-vertical" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ImageBackground
        source={{
          uri: "https://img.freepik.com/free-vector/abstract-chat-box-shape-pattern-white-background_1017-59690.jpg"
        }}
        style={styles.chatBackground}
        resizeMode="cover"
      >
        <FlatList
          data={messages}
          extraData={messages}
          keyExtractor={(item, index) => item._id || item.id || index.toString()}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            pagination?.hasMore ? (
              <TouchableOpacity
                style={styles.loadEarlierButton}
                onPress={loadMoreMessages}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <ActivityIndicator color={PRIMARY} />
                ) : (
                  <Text style={styles.loadEarlierText}>Load earlier messages</Text>
                )}
              </TouchableOpacity>
            ) : null
          }
        />
      </ImageBackground>

      <Modal visible={showTools} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setShowTools(false)}
          activeOpacity={1}
        >
          <View style={styles.toolboxContainer}>
            <FlatList
              data={tools}
              numColumns={3}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.toolItem}
                  onPress={item.action}
                  disabled={uploading}
                >
                  <View style={styles.toolIcon}>
                    <Icon name={item.icon} size={26} color="#fff" />
                  </View>
                  <Text style={styles.toolText}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={styles.inputContainer}>
        <TouchableOpacity onPress={() => setShowTools(true)} disabled={uploading}>
          <Icon name="add" size={28} color={PRIMARY} />
        </TouchableOpacity>

        <View style={styles.inputBox}>
          <TextInput
            placeholder={uploading ? "Uploading attachment..." : "Message"}
            placeholderTextColor="#888"
            style={styles.input}
            value={text}
            onChangeText={handleTextChange}
            editable={!sending && !uploading}
          />
        </View>

        {uploading ? (
          <ActivityIndicator color={PRIMARY} />
        ) : text.length > 0 ? (
          <TouchableOpacity style={styles.sendBtn} onPress={sendTextMessage} disabled={sending}>
            <Icon name="send" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.inlineActions}>
            <TouchableOpacity style={{ marginRight: 15 }} onPress={sendImageAttachment}>
              <Icon name="image" size={24} color={PRIMARY} />
            </TouchableOpacity>

            <TouchableOpacity onPress={sendAudioAttachment}>
              <Icon name="mic" size={24} color={PRIMARY} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

export default ChatScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff"
  },
  header: {
    backgroundColor: PRIMARY,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: (StatusBar.currentHeight || 0) + 14,
    paddingBottom: 15
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 12,
    flex: 1
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10
  },
  username: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600"
  },
  status: {
    color: "#e6d9ff",
    fontSize: 12
  },
  headerIcons: {
    flexDirection: "row",
    alignItems: "center"
  },
  chatBackground: {
    flex: 1
  },
  listContent: {
    padding: 12
  },
  loadEarlierButton: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 999,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  loadEarlierText: {
    color: PRIMARY,
    fontWeight: "600"
  },
  messageRow: {
    flexDirection: "row",
    marginVertical: 4
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: "78%"
  },
  messageText: {
    fontSize: 15,
    color: "#111"
  },
  myMessageText: {
    color: "#fff"
  },
  myMessage: {
    backgroundColor: PRIMARY
  },
  otherMessage: {
    backgroundColor: "#fff"
  },
  messageImage: {
    width: 220,
    height: 220,
    borderRadius: 12,
    marginBottom: 8
  },
  documentCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
    marginBottom: 6
  },
  documentName: {
    marginLeft: 8,
    color: PRIMARY,
    fontWeight: "600",
    maxWidth: 180
  },
  reactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8
  },
  reactionChip: {
    backgroundColor: "rgba(123, 63, 228, 0.12)",
    borderRadius: 999,
    marginRight: 6,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  myReactionChip: {
    backgroundColor: "rgba(255,255,255,0.22)"
  },
  reactionText: {
    color: "#1f1f1f",
    fontSize: 12,
    fontWeight: "600"
  },
  seenText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    marginTop: 8
  },
  myDocumentName: {
    color: "#fff"
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#eee"
  },
  inputBox: {
    flex: 1,
    backgroundColor: "#f2f2f2",
    borderRadius: 25,
    marginHorizontal: 10,
    paddingHorizontal: 15
  },
  input: {
    height: 40
  },
  sendBtn: {
    backgroundColor: PRIMARY,
    padding: 10,
    borderRadius: 25
  },
  inlineActions: {
    flexDirection: "row"
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-end"
  },
  toolboxContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 25,
    paddingBottom: 40,
    paddingHorizontal: 10
  },
  toolItem: {
    flex: 1,
    alignItems: "center",
    marginBottom: 22
  },
  toolIcon: {
    backgroundColor: PRIMARY,
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8
  },
  toolText: {
    color: "#444",
    fontSize: 13
  }
});
