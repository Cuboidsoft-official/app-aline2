import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { API } from "../api/api";
import Icon from "react-native-vector-icons/Ionicons";

const SearchScreen = ({ navigation }: any) => {

  const [users, setUsers] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [activeTab, setActiveTab] = useState("users");

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (activeTab === "sellers") {
      fetchSellers();
    } else {
      fetchUsers(currentUserId);
    }
  }, [activeTab]);

  const init = async () => {
    const id = await AsyncStorage.getItem("userId");
    setCurrentUserId(id);

    await Promise.all([
      fetchUsers(id),
      fetchSellers()
    ]);

    setLoading(false);
  };

  // ✅ USERS
  const fetchUsers = async (userId) => {
    try {
      const token = await AsyncStorage.getItem("token");

      const res = await API.get("/auth/users", {
        headers: { Authorization: `Bearer ${token}` }
      });

      const filtered = (res.data.users || []).filter(
        u => u._id !== userId
      );

      setUsers(filtered);

    } catch (error) {
      console.log("Users Error:", error);
    }
  };

  // ✅ SELLERS (🔥 FIXED)
  const fetchSellers = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      const res = await API.get("/seller/all", {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log("SELLER RAW:", res.data);

      let sellerData =
        res.data.sellers ||
        res.data.data ||
        res.data ||
        [];

      // 🔥 FIX: object → array
      if (!Array.isArray(sellerData)) {
        sellerData = [sellerData];
      }

      console.log("SELLER FINAL:", sellerData);

      setSellers(sellerData);

    } catch (error) {
      console.log("Seller Error:", error);
    }
  };

  // ✅ SEARCH
  const searchData = async (text) => {
    setSearch(text);

    try {
      const token = await AsyncStorage.getItem("token");

      if (text.trim() === "") {
        fetchUsers(currentUserId);
        fetchSellers();
        return;
      }

      if (activeTab === "users") {
        const res = await API.get(`/auth/search?query=${text}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const filtered = (res.data.users || []).filter(
          user => user._id !== currentUserId
        );

        setUsers(filtered);

      } else {
        const res = await API.get(`/seller/search?query=${text}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        let sellerData =
          res.data.sellers ||
          res.data.data ||
          res.data ||
          [];

        if (!Array.isArray(sellerData)) {
          sellerData = [sellerData];
        }

        setSellers(sellerData);
      }

    } catch (error) {
      console.log("Search Error:", error);
    }
  };

  // ✅ USER CARD
  const renderUser = ({ item }) => (
    <TouchableOpacity
      style={styles.userCard}
      onPress={() =>
        navigation.navigate("ProfilePreviewScreen", {
          userId: item._id
        })
      }
    >
      <Image
        source={{
          uri:
            item.profilePic ||
            "https://cdn-icons-png.flaticon.com/512/149/149071.png"
        }}
        style={styles.avatar}
      />

      <View>
        <Text style={styles.username}>{item.username}</Text>
        <Text style={styles.name}>{item.name}</Text>
      </View>
    </TouchableOpacity>
  );

  // ✅ SELLER CARD
  const renderSeller = ({ item }) => (
    <TouchableOpacity
      style={styles.userCard}
      onPress={() =>
        navigation.navigate("SellerPreviewScreen", {
          sellerId: item._id?.$oid || item._id // 🔥 handle mongo format
        })
      }
    >
      <Image
        source={{
          uri:
            item.profilePic ||
            "https://cdn-icons-png.flaticon.com/512/149/149071.png"
        }}
        style={styles.avatar}
      />

      <View>
        <Text style={styles.username}>
          {item.sellerName || "Seller"}
        </Text>
        <Text style={styles.name}>
          {item.specialization || "Service Provider"}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Search</Text>

        <View style={{ width: 24 }} />
      </View>

      {/* SEARCH */}
      <View style={styles.searchBar}>
        <Icon name="search-outline" size={20} color="#777" />
        <TextInput
          placeholder={`Search ${activeTab}...`}
          style={styles.searchInput}
          value={search}
          onChangeText={searchData}
        />
      </View>

      {/* TABS */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "users" && styles.activeTab]}
          onPress={() => setActiveTab("users")}
        >
          <Text style={activeTab === "users" && styles.activeText}>
            Users
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === "sellers" && styles.activeTab]}
          onPress={() => setActiveTab("sellers")}
        >
          <Text style={activeTab === "sellers" && styles.activeText}>
            Sellers
          </Text>
        </TouchableOpacity>
      </View>

      {/* LIST */}
      <FlatList
        data={activeTab === "users" ? users : sellers}
        keyExtractor={(item, index) => index.toString()}
        renderItem={activeTab === "users" ? renderUser : renderSeller}
        ListEmptyComponent={
          <Text style={{ textAlign: "center", marginTop: 20 }}>
            No {activeTab} found
          </Text>
        }
      />

    </View>
  );
};

export default SearchScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 50
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 15,
    marginBottom: 10
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "bold"
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f1f1",
    marginHorizontal: 15,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 45,
    marginBottom: 10
  },

  searchInput: {
    flex: 1,
    marginLeft: 8
  },

  tabs: {
    flexDirection: "row",
    marginHorizontal: 15,
    marginBottom: 10
  },

  tab: {
    flex: 1,
    padding: 10,
    alignItems: "center",
    borderBottomWidth: 2,
    borderColor: "transparent"
  },

  activeTab: {
    borderColor: "#7B4DFF"
  },

  activeText: {
    fontWeight: "bold",
    color: "#7B4DFF"
  },

  userCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderBottomWidth: 1,
    borderColor: "#eee"
  },

  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 15
  },

  username: {
    fontWeight: "bold"
  },

  name: {
    color: "#666"
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  }
});