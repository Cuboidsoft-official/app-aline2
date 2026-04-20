import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";

import { Alert } from "../utils/appAlert";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { useAppTheme } from "../theme/AppThemeContext";
import {
  createLiveStream,
  getMyActiveLiveStream,
  listLiveStreams,
} from "../utils/liveStreamApi";

const formatStartedAt = (value?: string) => {
  if (!value) {
    return "Starting now";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Live now";
  }

  return `Started ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
};

const LiveStreamsScreen = ({ navigation, route }: any) => {
  const { colors } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [liveStreams, setLiveStreams] = useState<any[]>([]);
  const [myLiveStream, setMyLiveStream] = useState<any>(null);
  const [iceServers, setIceServers] = useState<any[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const autoLaunchHandledRef = useRef(false);

  const loadData = useCallback(async () => {
    const [listResponse, mineResponse] = await Promise.all([
      listLiveStreams(),
      getMyActiveLiveStream(),
    ]);

    setLiveStreams(Array.isArray(listResponse?.liveStreams) ? listResponse.liveStreams : []);
    setMyLiveStream(mineResponse?.liveStream || null);
    setIceServers(Array.isArray(mineResponse?.iceServers) ? mineResponse.iceServers : Array.isArray(listResponse?.iceServers) ? listResponse.iceServers : []);
    setErrorMessage("");
  }, []);

  useEffect(() => {
    let active = true;

    loadData()
      .catch((error) => {
        if (!active) {
          return;
        }

        setLiveStreams([]);
        setMyLiveStream(null);
        setErrorMessage(getReadableApiErrorMessage(error, "Unable to load live streams right now."));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await loadData();
    } catch (error) {
      setErrorMessage(getReadableApiErrorMessage(error, "Unable to refresh live streams."));
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const openLiveStream = useCallback((liveStream: any, mode: "host" | "viewer") => {
    navigation.navigate("LiveStreamScreen", {
      liveStreamId: liveStream?._id,
      initialLiveStream: liveStream,
      initialIceServers: iceServers,
      mode,
    });
  }, [iceServers, navigation]);

  const handleStartLive = useCallback(async () => {
    try {
      setCreating(true);
      const response = myLiveStream
        ? { liveStream: myLiveStream, iceServers }
        : await createLiveStream();

      const nextLiveStream = response?.liveStream;
      if (!nextLiveStream?._id) {
        throw new Error("The live stream could not be created.");
      }

      setMyLiveStream(nextLiveStream);
      if (Array.isArray(response?.iceServers) && response.iceServers.length) {
        setIceServers(response.iceServers);
      }
      openLiveStream(nextLiveStream, "host");
    } catch (error) {
      Alert.alert("Unable to go live", getReadableApiErrorMessage(error, "The live stream could not be started."));
    } finally {
      setCreating(false);
    }
  }, [iceServers, myLiveStream, openLiveStream]);

  useEffect(() => {
    if (loading || creating || autoLaunchHandledRef.current) {
      return;
    }

    if (String(route?.params?.focusMode || "").trim().toLowerCase() !== "host") {
      return;
    }

    autoLaunchHandledRef.current = true;
    handleStartLive().catch(() => undefined);
  }, [creating, handleStartLive, loading, route?.params?.focusMode]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Live Streams</Text>
          <Text style={[styles.subtitle, { color: colors.mutedText }]}>Join active broadcasts or start your own live room anytime.</Text>
        </View>
        <TouchableOpacity
          style={[styles.liveButton, { backgroundColor: colors.primary }, creating && styles.liveButtonDisabled]}
          onPress={handleStartLive}
          disabled={creating}
        >
          {creating ? <ActivityIndicator color="#fff" /> : <Icon name={myLiveStream ? "radio-outline" : "videocam-outline"} size={18} color="#fff" />}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {myLiveStream ? (
          <TouchableOpacity
            style={[styles.hostCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            activeOpacity={0.88}
            onPress={() => openLiveStream(myLiveStream, "host")}
          >
            <View style={styles.hostCardHeader}>
              <View style={[styles.hostBadge, { backgroundColor: `${colors.primary}18` }]}>
                <Icon name="radio" size={15} color={colors.primary} />
                <Text style={[styles.hostBadgeText, { color: colors.primary }]}>You are live</Text>
              </View>
              <Text style={[styles.viewerCount, { color: colors.text }]}>{Number(myLiveStream?.viewerCount) || 0} viewers</Text>
            </View>
            <Text style={[styles.hostTitle, { color: colors.text }]}>{myLiveStream?.title || "Live Session"}</Text>
            <Text style={[styles.hostBody, { color: colors.mutedText }]}>{myLiveStream?.description || "Tap to rejoin your active live room."}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.hostCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            activeOpacity={0.88}
            onPress={handleStartLive}
          >
            <View style={styles.hostCardHeader}>
              <View style={[styles.hostBadge, { backgroundColor: `${colors.primary}18` }]}>
                <Icon name="flash-outline" size={15} color={colors.primary} />
                <Text style={[styles.hostBadgeText, { color: colors.primary }]}>Go live</Text>
              </View>
            </View>
            <Text style={[styles.hostTitle, { color: colors.text }]}>Start a live stream</Text>
            <Text style={[styles.hostBody, { color: colors.mutedText }]}>Go live from here and let other users join your room in real time.</Text>
          </TouchableOpacity>
        )}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : errorMessage ? (
          <Text style={[styles.emptyText, { color: colors.mutedText }]}>{errorMessage}</Text>
        ) : liveStreams.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedText }]}>No live streams are active right now.</Text>
        ) : (
          liveStreams.map((item) => (
            <TouchableOpacity
              key={item?._id}
              style={[styles.streamCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.9}
              onPress={() => openLiveStream(item, item?.isHost ? "host" : "viewer")}
            >
              <View style={styles.streamRow}>
                <View style={[styles.dot, { backgroundColor: "#ef4444" }]} />
                <Text style={[styles.streamStatus, { color: "#ef4444" }]}>LIVE</Text>
              </View>
              <Text style={[styles.streamTitle, { color: colors.text }]}>{item?.title || "Live Session"}</Text>
              <Text style={[styles.streamHost, { color: colors.mutedText }]}>
                {item?.hostDisplayName || item?.hostSeller?.sellerName || "Aline2 Creator"}
              </Text>
              <Text style={[styles.streamDescription, { color: colors.mutedText }]} numberOfLines={2}>
                {item?.description || "Live discussion, Q&A, updates, or community stream."}
              </Text>
              <View style={styles.streamFooter}>
                <Text style={[styles.streamMeta, { color: colors.mutedText }]}>{formatStartedAt(item?.startedAt)}</Text>
                <Text style={[styles.streamMeta, { color: colors.text }]}>{Number(item?.viewerCount) || 0} watching</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, marginLeft: 4, marginRight: 12 },
  title: { fontSize: 22, fontWeight: "900" },
  subtitle: { marginTop: 4, fontSize: 13, lineHeight: 19 },
  liveButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  liveButtonDisabled: { opacity: 0.55 },
  content: { padding: 16, paddingBottom: 30 },
  hostCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  hostCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hostBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  hostBadgeText: { marginLeft: 6, fontSize: 12, fontWeight: "800" },
  viewerCount: { fontSize: 12, fontWeight: "700" },
  hostTitle: { marginTop: 12, fontSize: 18, fontWeight: "900" },
  hostBody: { marginTop: 6, fontSize: 13, lineHeight: 19 },
  streamCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  streamRow: { flexDirection: "row", alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  streamStatus: { marginLeft: 8, fontSize: 12, fontWeight: "900" },
  streamTitle: { marginTop: 10, fontSize: 17, fontWeight: "900" },
  streamHost: { marginTop: 4, fontSize: 13, fontWeight: "700" },
  streamDescription: { marginTop: 8, fontSize: 13, lineHeight: 19 },
  streamFooter: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  streamMeta: { fontSize: 12, fontWeight: "700" },
  emptyText: { marginTop: 48, fontSize: 14, textAlign: "center", lineHeight: 20 },
});

export default LiveStreamsScreen;
