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
  ScrollView
} from "react-native";

import Icon from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API } from "../api/api";
import { socket } from "../socket";

const PRIMARY = "#7B4DFF";

const SellerChatScreen = ({ route, navigation }) => {
  const { sellerId, conversationId } = route.params;

  const [seller, setSeller] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");

  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const quickOptions = [
    "I want to book",
    "What are your charges?",
    "Are you available?",
    "Call me"
  ];

  useEffect(() => {
    fetchSeller();
    fetchMessages();
    fetchServices();

    socket.emit("joinConversation", conversationId);

    socket.on("receiveMessage", (msg) => {
      setMessages((prev) => {
        const exists = prev.find((m) => m._id === msg._id);
        if (exists) return prev;
        return [...prev, msg];
      });
    });

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

  const sendMessage = async (msgText = text) => {
    if (!msgText.trim()) return;

    const token = await AsyncStorage.getItem("token");

    const res = await API.post(
      "/message/send",
      {
        conversationId,
        text: msgText,
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

  // ================= UI =================

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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY} />

      {/* HEADER */}
      <View style={styles.header}>

        {/* LEFT - BACK */}
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        {/* CENTER - SELLER INFO (CLICKABLE) */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.centerHeader}
          onPress={() =>
            navigation.navigate("SellerDetailsScreen", { sellerId })
          }
        >
          <Image
            source={{
              uri:
                seller?.profilePic ||
                "https://cdn-icons-png.flaticon.com/512/149/149071.png"
            }}
            style={styles.avatar}
          />

          <View style={{ marginLeft: 8 }}>
            <Text style={styles.name}>
              {seller?.sellerName || "Loading..."}
            </Text>
            <Text style={styles.status}>Online</Text>
          </View>
        </TouchableOpacity>

        {/* RIGHT ICONS */}
        <View style={styles.rightIcons}>
          <TouchableOpacity style={{ marginRight: 15 }}>
            <Icon name="call" size={20} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity>
            <Icon name="videocam" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

      </View>

      {/* SERVICES */}
      <View style={styles.premiumServiceWrap}>
        <Text style={styles.premiumTitle}>Available Services</Text>

        <FlatList
          horizontal
          data={services}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ paddingHorizontal: 10 }}
          renderItem={({ item }) => {
            const isSelected = selectedService?._id === item._id;

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
                  ₹{item.pricePerMin || item.pricePerMsg || item.packagePrice}
                </Text>

                {isSelected && (
                  <TouchableOpacity
                    style={styles.bookNowBtn}
                    onPress={() => setShowPaymentModal(true)}
                  >
                    <Text style={styles.bookNowText}>Book Now</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* CHAT + QUICK */}
      <View style={{ flex: 1 }}>
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item, index) => index.toString()}
          contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
        />

        {/* QUICK REPLIES */}
        <View style={styles.quickContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {quickOptions.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.quickChip}
                onPress={() => sendMessage(item)}
              >
                <Text style={styles.quickText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* INPUT */}
      <View style={styles.inputWrap}>
        <TextInput
          placeholder="Message..."
          value={text}
          onChangeText={setText}
          style={styles.input}
        />

        {text.trim() ? (
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
            <Icon name="send" size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <Icon name="mic-outline" size={24} color={PRIMARY} />
        )}
      </View>

      {/* PAYMENT MODAL */}
      <Modal visible={showPaymentModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Confirm Booking</Text>

            <Text style={styles.modalService}>
              {selectedService?.serviceName}
            </Text>

            <Text style={styles.modalPrice}>
              ₹{selectedService?.pricePerMin || selectedService?.pricePerMsg || selectedService?.packagePrice}
            </Text>

            <Text style={styles.modalNote}>
              Payment Gateway is not added yet ⚠️
            </Text>

            <TouchableOpacity style={styles.payBtn}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                Continue
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
  paddingTop: StatusBar.currentHeight || 80,
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

  sellerInfo: { flexDirection: "row", alignItems: "center" },

  avatar: { width: 36, height: 36, borderRadius: 18, marginHorizontal: 10 },

  name: { color: "#fff", fontWeight: "700" },

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
    width: 140,
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
    marginRight: 10,

  },

  quickText: { color: PRIMARY, fontWeight: "600" },

  inputWrap: {
    flexDirection: "row",
    padding: 10,
    backgroundColor: "#fff"
  },

  input: {
    flex: 1,
    backgroundColor: "#F1F1F4",
    borderRadius: 25,
    paddingHorizontal: 15
  },

  sendBtn: {
    backgroundColor: PRIMARY,
    padding: 10,
    borderRadius: 20,
    marginLeft: 8
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

  modalNote: {
    marginTop: 10,
    fontSize: 12,
    color: "#777",
    textAlign: "center"
  },

  payBtn: {
    marginTop: 15,
    backgroundColor: PRIMARY,
    padding: 12,
    borderRadius: 12,
    width: "100%",
    alignItems: "center"
  }
});