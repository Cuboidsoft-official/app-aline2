import React, { useEffect, useState } from "react";
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
  Animated
} from "react-native";

import Icon from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API } from "../api/api";
import { socket } from "../socket";

const PRIMARY = "#7B4DFF";

const SellerChatScreen = ({ route, navigation }:any) => {
  const { sellerId, conversationId } = route.params;

  const [seller, setSeller] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");

  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showSnackbar, setShowSnackbar] = useState(true);

  useEffect(() => {
    fetchSeller();
    fetchMessages();
    fetchServices();

    socket.emit("joinConversation", conversationId);

    socket.on("receiveMessage", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    // Snackbar auto hide
    setTimeout(() => setShowSnackbar(false), 3000);

    return () => socket.off("receiveMessage");
  }, []);

  // ================= API =================

  const fetchSeller = async () => {
    const token = await AsyncStorage.getItem("token");
    const res = await API.get(`/seller/${sellerId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setSeller(res.data.seller);
  };

  const fetchServices = async () => {
    const token = await AsyncStorage.getItem("token");
    const res = await API.get(`/service/seller/${sellerId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setServices(res.data.services || []);
  };

  const fetchMessages = async () => {
    const token = await AsyncStorage.getItem("token");
    const res = await API.get(`/message/${conversationId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setMessages(res.data.messages || []);
  };

  const sendMessage = async () => {
    if (!text.trim()) return;

    const token = await AsyncStorage.getItem("token");

    const res = await API.post(
      "/message/send",
      {
        conversationId,
        text,
        messageType: "text"
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    setMessages((prev) => [...prev, res.data.message]);

    socket.emit("sendMessage", {
      conversationId,
      message: res.data.message
    });

    setText("");
  };

  // ================= MESSAGE =================

  const renderMessage = ({ item }) => {
    const isMine = item.isMine;

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
          <Text style={isMine ? styles.myText : styles.otherText}>
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  // ================= UI =================

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY} />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={styles.sellerInfo}>
          <Image source={{ uri: seller?.profilePic }} style={styles.avatar} />
          <Text style={styles.name}>{seller?.sellerName}</Text>
        </View>

        <View style={{ flexDirection: "row" }}>
          <Icon name="call" size={20} color="#fff" style={{ marginRight: 15 }} />
          <Icon name="videocam" size={22} color="#fff" />
        </View>
      </View>

      {/* CENTER SERVICES */}
      <View style={styles.centerServices}>
        <FlatList
          horizontal
          data={services}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.serviceCard}
              onPress={() => {
                setSelectedService(item);
                setShowPaymentModal(true);
              }}
            >
              <Text style={styles.serviceName}>{item.serviceName}</Text>

              <Text style={styles.servicePrice}>
                ₹{item.pricePerMin || item.pricePerMsg || item.packagePrice}
              </Text>

              <View style={styles.bookBtn}>
                <Text style={{ color: "#fff" }}>Book</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* CHAT */}
      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item, index) => index.toString()}
        contentContainerStyle={{ padding: 12 }}
      />

      {/* INPUT */}
      <View style={styles.inputContainer}>
        <TouchableOpacity onPress={() => setShowTools(true)}>
          <Icon name="add" size={26} color={PRIMARY} />
        </TouchableOpacity>

        <View style={styles.inputBox}>
          <TextInput
            placeholder="Message"
            value={text}
            onChangeText={setText}
            style={styles.input}
          />
        </View>

        {text.trim() ? (
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
            <Icon name="send" size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <>
            <Icon name="camera-outline" size={24} color={PRIMARY} style={{ marginRight: 10 }} />
            <Icon name="mic-outline" size={24} color={PRIMARY} />
          </>
        )}
      </View>

      {/* TOOLBOX */}
      <Modal visible={showTools} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setShowTools(false)}
        >
          <View style={styles.toolbox}>
            {["camera", "image", "document", "location", "happy"].map((icon, i) => (
              <TouchableOpacity key={i} style={styles.toolItem}>
                <View style={styles.toolIcon}>
                  <Icon name={icon} size={22} color="#fff" />
                </View>
                <Text>{icon}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* PAYMENT MODAL */}
      <Modal visible={showPaymentModal} transparent animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {selectedService?.serviceName}
            </Text>

            <Text style={styles.modalPrice}>
              ₹{selectedService?.pricePerMin ||
                selectedService?.pricePerMsg ||
                selectedService?.packagePrice}
            </Text>

            <Text style={{ marginTop: 10 }}>
              ⚠️ Payment Gateway is not added
            </Text>

            <TouchableOpacity
              style={styles.payBtn}
              onPress={() => setShowPaymentModal(false)}
            >
              <Text style={{ color: "#fff" }}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SNACKBAR */}
      {showSnackbar && (
        <View style={styles.snackbar}>
          <Text style={{ color: "#fff" }}>
            You are now chatting with seller
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
};

export default SellerChatScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5FA" },

  header: {
    backgroundColor: PRIMARY,
    paddingTop: 45,
    paddingBottom: 15,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },

  sellerInfo: { flexDirection: "row", alignItems: "center" },

  avatar: { width: 36, height: 36, borderRadius: 18, marginHorizontal: 10 },

  name: { color: "#fff", fontWeight: "700" },

  centerServices: {
    alignItems: "center",
    paddingVertical: 10
  },

  serviceCard: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 16,
    marginHorizontal: 8,
    alignItems: "center",
    elevation: 4
  },

  serviceName: { fontWeight: "700" },

  servicePrice: { color: PRIMARY, marginVertical: 6 },

  bookBtn: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10
  },

  msgRow: { marginVertical: 5 },

  msgBubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: "75%"
  },

  myMsg: { backgroundColor: PRIMARY },
  otherMsg: { backgroundColor: "#fff" },

  myText: { color: "#fff" },
  otherText: { color: "#111" },

  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#fff"
  },

  inputBox: {
    flex: 1,
    backgroundColor: "#F1F1F4",
    borderRadius: 25,
    marginHorizontal: 10,
    paddingHorizontal: 15
  },

  input: { height: 40 },

  sendBtn: {
    backgroundColor: PRIMARY,
    padding: 10,
    borderRadius: 25
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end"
  },

  toolbox: {
    backgroundColor: "#fff",
    padding: 20,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    flexDirection: "row",
    justifyContent: "space-around"
  },

  toolItem: { alignItems: "center" },

  toolIcon: {
    backgroundColor: PRIMARY,
    padding: 12,
    borderRadius: 25,
    marginBottom: 6
  },

  modalOverlayCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)"
  },

  modalBox: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 16,
    width: "80%",
    alignItems: "center"
  },

  modalTitle: { fontWeight: "700", fontSize: 16 },

  modalPrice: { color: PRIMARY, marginTop: 5 },

  payBtn: {
    marginTop: 15,
    backgroundColor: PRIMARY,
    padding: 10,
    borderRadius: 10,
    width: "100%",
    alignItems: "center"
  },

  snackbar: {
    position: "absolute",
    bottom: 90,
    left: 20,
    right: 20,
    backgroundColor: "#333",
    padding: 12,
    borderRadius: 10,
    alignItems: "center"
  }
});