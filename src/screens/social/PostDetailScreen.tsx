import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Alert } from "../../utils/appAlert";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { createSound } from "react-native-nitro-sound";
import Icon from "react-native-vector-icons/Ionicons";

import ContentActionSheet from "../../features/social/components/ContentActionSheet";
import PostCommentsSheet from "../../features/social/components/PostCommentsSheet";
import ProgressiveImage from "../../features/social/components/ProgressiveImage";
import PostShareSheet from "../../features/social/components/PostShareSheet";
import SocialVideo from "../../features/social/components/SocialVideo";
import { socialApi } from "../../features/social/socialApi";
import { Post } from "../../features/social/types";
import { toUserSafeMessage } from "../../features/social/validation";
import { DEFAULT_AVATAR_URL } from "../../constants/defaultAssets";
import { PHOTO_FILTER_LIST } from "../../utils/photoFilters";
import { getStoredUserId } from "../../utils/authSession";
import { downloadImageAsset } from "../../utils/mediaDownload";
import { normalizeMediaUrl } from "../../utils/mediaUrls";
import { useAppTheme } from "../../theme/AppThemeContext";

let ColorMatrix: any = null;
try {
  ColorMatrix = require("react-native-color-matrix-image-filters").ColorMatrix;
} catch {
  ColorMatrix = null;
}

const formatPostTime = (timestamp?: number) => {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return "now";
  }

  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / (1000 * 60)));
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
};

function PostDetailScreen({ route, navigation }: any) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const postId = typeof route?.params?.postId === "string" ? route.params.postId : "";

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [busyLike, setBusyLike] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [busyDownload, setBusyDownload] = useState(false);
  const [activeSheet, setActiveSheet] = useState<null | "comments" | "share" | "actions">(null);
  const [isMediaSoundEnabled, setIsMediaSoundEnabled] = useState(true);

  const [caption, setCaption] = useState("");
  const [hideLikeCount, setHideLikeCount] = useState(false);
  const [disableComments, setDisableComments] = useState(false);
  const musicPlayerRef = useRef(createSound());
  const musicTrackKeyRef = useRef("");
  const musicEndMsRef = useRef(0);
  const postTapRef = useRef<{ time: number; timeout: ReturnType<typeof setTimeout> | null }>({
    time: 0,
    timeout: null,
  });

  useFocusEffect(
    React.useCallback(() => {
      let active = true;

      const load = async () => {
        try {
          if (!postId) {
            throw new Error("Invalid post id");
          }

          const [data, nextUserId] = await Promise.all([socialApi.getPost(postId), getStoredUserId()]);

          if (!active) {
            return;
          }

          setPost(data);
          setCurrentUserId(nextUserId);
          setCaption(data.caption);
          setHideLikeCount(data.settings.hideLikeCount);
          setDisableComments(data.settings.disableComments);
        } catch (error) {
          if (active) {
            Alert.alert("Failed to load post", toUserSafeMessage(error));
            navigation.goBack();
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

      load();

      return () => {
        active = false;
      };
    }, [navigation, postId]),
  );

  const attachedMusicUrl = useMemo(
    () => normalizeMediaUrl(post?.music?.previewUrl || ""),
    [post?.music?.previewUrl],
  );
  const attachedMusicStartMs = Math.max(0, Number(post?.music?.startTime || 0) * 1000);
  const attachedMusicDurationMs = Math.max(0, Number(post?.music?.duration || 0) * 1000);
  const attachedMusicTrackKey = post
    ? `${post.id}:${attachedMusicUrl}:${attachedMusicStartMs}:${attachedMusicDurationMs}`
    : "";

  useEffect(() => {
    const player = musicPlayerRef.current;

    player.setSubscriptionDuration(0.1);
    player.addPlayBackListener((event: any) => {
      const playbackEndMs = musicEndMsRef.current;
      const currentPosition = Math.max(0, Number(event?.currentPosition || 0));

      if (playbackEndMs > 0 && currentPosition >= playbackEndMs) {
        musicEndMsRef.current = 0;
        player.pausePlayer().catch(() => undefined);
      }
    });
    player.addPlaybackEndListener(() => {
      musicEndMsRef.current = 0;
    });

    return () => {
      if (postTapRef.current.timeout) {
        clearTimeout(postTapRef.current.timeout);
      }

      try {
        player.removePlayBackListener();
      } catch {
        // noop
      }

      try {
        player.removePlaybackEndListener();
      } catch {
        // noop
      }

      player.stopPlayer().catch(() => undefined);
      player.dispose();
    };
  }, []);

  useEffect(() => {
    const player = musicPlayerRef.current;
    const shouldPlayMusic = !!attachedMusicUrl && isMediaSoundEnabled && !activeSheet;

    const stopMusic = async () => {
      musicTrackKeyRef.current = "";
      musicEndMsRef.current = 0;

      try {
        await player.stopPlayer();
      } catch {
        // noop
      }
    };

    if (!shouldPlayMusic) {
      stopMusic().catch(() => undefined);
      return;
    }

    if (musicTrackKeyRef.current === attachedMusicTrackKey) {
      player.resumePlayer().catch(() => undefined);
      return;
    }

    let cancelled = false;

    const playMusic = async () => {
      await stopMusic();
      if (cancelled || !attachedMusicUrl) {
        return;
      }

      musicTrackKeyRef.current = attachedMusicTrackKey;
      musicEndMsRef.current =
        attachedMusicDurationMs > 0 ? attachedMusicStartMs + attachedMusicDurationMs : 0;

      await player.startPlayer(attachedMusicUrl);
      await player.seekToPlayer(attachedMusicStartMs);
      await player.setVolume(1);
    };

    playMusic().catch((error) => {
      console.log("post detail music playback error", error);
      stopMusic().catch(() => undefined);
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeSheet,
    attachedMusicDurationMs,
    attachedMusicStartMs,
    attachedMusicTrackKey,
    attachedMusicUrl,
    isMediaSoundEnabled,
  ]);

  const saveChanges = async () => {
    if (!post || saving || post.user.id !== currentUserId) {
      return;
    }

    try {
      setSaving(true);
      const updated = await socialApi.updatePost(post.id, {
        caption,
        settings: {
          hideLikeCount,
          disableComments,
        },
      });

      setPost(updated);
      setEditing(false);
      Alert.alert("Updated", "Post updated successfully.");
    } catch (error) {
      Alert.alert("Could not update", toUserSafeMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const deletePost = async () => {
    if (!post || post.user.id !== currentUserId) {
      return;
    }

    Alert.alert("Delete post", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await socialApi.deletePost(post.id);
            navigation.goBack();
          } catch (error) {
            Alert.alert("Delete failed", toUserSafeMessage(error));
          }
        },
      },
    ]);
  };

  const toggleLike = async () => {
    if (!post || busyLike) {
      return;
    }

    try {
      setBusyLike(true);
      const updated = await socialApi.togglePostLike(post.id);
      setPost(updated);
    } catch (error) {
      Alert.alert("Could not update like", toUserSafeMessage(error));
    } finally {
      setBusyLike(false);
    }
  };

  const toggleSave = async () => {
    if (!post || busySave) {
      return;
    }

    try {
      setBusySave(true);
      const updated = await socialApi.togglePostSave(post.id);
      setPost(updated);
    } catch (error) {
      Alert.alert("Could not save post", toUserSafeMessage(error));
    } finally {
      setBusySave(false);
    }
  };

  const handleDownload = async () => {
    if (!post || busyDownload) {
      return;
    }

    const primaryImage = post.media.find((asset) => asset.mediaType === "image");
    if (!primaryImage?.url) {
      Alert.alert("Download unavailable", "Only image posts can be downloaded right now.");
      return;
    }

    try {
      setBusyDownload(true);
      const fileUri = await downloadImageAsset(primaryImage.url, `aline2_post_${post.id}`);
      if (/^file:\/\//i.test(fileUri)) {
        Alert.alert("Downloaded", `Image saved to:\n${fileUri}`);
      } else {
        Alert.alert("Download ready", "The download or share sheet has been opened for this image.");
      }
    } catch (error) {
      Alert.alert("Could not download image", toUserSafeMessage(error));
    } finally {
      setBusyDownload(false);
    }
  };

  const handleMediaPress = () => {
    if (!post) {
      return;
    }

    const now = Date.now();
    const lastTap = postTapRef.current;
    const hasAudioLayer = post.media.some((asset) => asset.mediaType === "video") || !!post.music?.previewUrl;

    if (now - lastTap.time < 260) {
      if (lastTap.timeout) {
        clearTimeout(lastTap.timeout);
      }
      postTapRef.current = { time: 0, timeout: null };
      toggleLike().catch(() => undefined);
      return;
    }

    const timeout = setTimeout(() => {
      if (hasAudioLayer) {
        setIsMediaSoundEnabled((current) => !current);
      }
      postTapRef.current = { time: 0, timeout: null };
    }, 260);

    postTapRef.current = {
      time: now,
      timeout,
    };
  };

  const closeSheet = () => setActiveSheet(null);

  const renderMediaAsset = (asset: Post["media"][number], key?: string) => {
    const assetUrl = normalizeMediaUrl(asset?.url);
    const posterUrl = normalizeMediaUrl(asset?.thumbnailUrl || asset?.url);

    if (!assetUrl) {
      return <View key={key} style={styles.image} />;
    }

    if (asset.mediaType === "video") {
      return (
        <SocialVideo
          key={key || asset.id}
          uri={assetUrl}
          posterUri={posterUrl}
          style={styles.image}
          muted={!isMediaSoundEnabled || !!post?.music?.previewUrl}
          repeat
        />
      );
    }

    const rawImage = (
      <ProgressiveImage
        key={key || asset.id}
        uri={assetUrl}
        previewUri={posterUrl}
        style={styles.image}
      />
    );

    if (post?.filterPreset && ColorMatrix) {
      const activeFilter = PHOTO_FILTER_LIST.find((filter) => filter.id === post.filterPreset);
      if (activeFilter?.matrix) {
        return <ColorMatrix key={key || asset.id} matrix={activeFilter.matrix}>{rawImage}</ColorMatrix>;
      }
    }

    return rawImage;
  };

  const renderStickerOverlay = () => {
    if (!post?.stickers?.length) {
      return null;
    }

    return (
      <View pointerEvents="none" style={styles.stickerLayer}>
        {post.stickers.map((sticker) => {
          const baseStyle = {
            left: `${Math.max(0, Math.min(1, sticker.position.x)) * 100}%`,
            top: `${Math.max(0, Math.min(1, sticker.position.y)) * 100}%`,
            width: `${Math.max(0.12, Math.min(1, sticker.position.width)) * 100}%`,
            minHeight: `${Math.max(0.08, Math.min(1, sticker.position.height)) * 100}%`,
            transform: [
              { rotate: `${sticker.position.rotation || 0}deg` },
              { scale: sticker.position.scale || 1 },
            ],
          } as const;

          if (sticker.type === "emoji") {
            return (
              <View key={sticker.id} style={[styles.emojiSticker, baseStyle]}>
                <Text style={[styles.emojiStickerText, sticker.style?.fontSize ? { fontSize: sticker.style.fontSize } : null]}>
                  {sticker.text}
                </Text>
              </View>
            );
          }

          return (
            <View
              key={sticker.id}
              style={[
                styles.textSticker,
                baseStyle,
                sticker.style?.backgroundColor ? { backgroundColor: sticker.style.backgroundColor } : null,
              ]}
            >
              <Text
                style={[
                  styles.textStickerText,
                  sticker.style?.color ? { color: sticker.style.color } : null,
                  sticker.style?.fontSize ? { fontSize: sticker.style.fontSize } : null,
                  sticker.style?.alignment ? { textAlign: sticker.style.alignment } : null,
                ]}
              >
                {sticker.text}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  if (loading || !post) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const canManagePost = !!currentUserId && post.user.id === currentUserId;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={["top"]}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12), borderColor: colors.border, backgroundColor: colors.card }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Post Details</Text>
          <View style={styles.headerActions}>
            {!editing && post ? (
              <TouchableOpacity style={styles.headerActionGap} onPress={() => setActiveSheet("actions")}>
                <Icon name="ellipsis-horizontal" size={20} color={colors.text} />
              </TouchableOpacity>
            ) : null}
            {canManagePost ? (
              <TouchableOpacity onPress={() => (editing ? saveChanges() : setEditing(true))}>
                <Text style={[styles.editButton, { color: colors.primary }]}>{editing ? "Save" : "Edit"}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <Pressable style={[styles.mediaSurface, { backgroundColor: colors.card }]} onPress={handleMediaPress}>
            {post.type === "carousel" ? (
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
                {post.media.map((asset) => renderMediaAsset(asset, asset.id))}
              </ScrollView>
            ) : (
              post.media[0] ? renderMediaAsset(post.media[0], post.media[0].id) : <View style={styles.image} />
            )}
            {renderStickerOverlay()}

            {(post.music?.previewUrl || post.media.some((asset) => asset.mediaType === "video")) ? (
              <View style={styles.mediaSoundBadge}>
                <Icon
                  name={isMediaSoundEnabled ? "volume-high-outline" : "volume-mute-outline"}
                  size={16}
                  color="#fff"
                />
                <Text style={styles.mediaSoundBadgeText}>
                  {isMediaSoundEnabled ? "Tap to mute" : "Tap for sound"}
                </Text>
              </View>
            ) : null}
          </Pressable>

          <View style={[styles.body, { backgroundColor: colors.card }]}>
            <View style={styles.userRow}>
              <TouchableOpacity
                style={styles.userIdentity}
                activeOpacity={0.85}
                onPress={() =>
                  navigation.navigate(
                    String(post.user.id || "") === String(currentUserId || "") ? "Profile" : "ProfilePreviewScreen",
                    String(post.user.id || "") === String(currentUserId || "") ? undefined : { userId: post.user.id },
                  )
                }
              >
                <Image source={{ uri: normalizeMediaUrl(post.user.avatarUrl || DEFAULT_AVATAR_URL) }} style={styles.userAvatar} />
                <View style={styles.userCopy}>
                  <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                    {post.user.username || post.user.name || "User"}
                  </Text>
                  <Text style={[styles.userMeta, { color: colors.mutedText }]} numberOfLines={1}>
                    {formatPostTime(post.createdAt)} {post.editedAt ? "• Edited" : ""}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionIcon} onPress={toggleLike}>
                <Icon name={post.liked ? "heart" : "heart-outline"} size={24} color={post.liked ? "#ef476f" : colors.text} />
                {!post.settings.hideLikeCount ? <Text style={[styles.actionCount, { color: colors.text }]}>{post.likesCount}</Text> : null}
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionIcon} onPress={() => setActiveSheet("comments")}>
                <Icon name="chatbubble-outline" size={22} color={colors.text} />
                <Text style={[styles.actionCount, { color: colors.text }]}>{post.commentsCount}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionIcon} onPress={() => setActiveSheet("share")}>
                <Icon name="paper-plane-outline" size={22} color={colors.text} />
                <Text style={[styles.actionCount, { color: colors.text }]}>{post.sharesCount}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionIcon} onPress={handleDownload}>
                {busyDownload ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Icon name="download-outline" size={22} color={colors.text} />
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.bookmarkIcon} onPress={toggleSave}>
                <Icon name={post.saved ? "bookmark" : "bookmark-outline"} size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: colors.text }]}>Caption</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text, backgroundColor: editing ? colors.card : colors.surface },
                !editing && styles.inputReadOnly,
              ]}
              value={caption}
              onChangeText={setCaption}
              editable={editing}
              multiline
              placeholderTextColor={colors.placeholder}
            />

            <Text style={[styles.label, { color: colors.text }]}>Location</Text>
            <View style={[styles.readOnlyField, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.readOnlyText, { color: colors.text }]}>{post.location || "Not set"}</Text>
            </View>

            <Text style={[styles.label, { color: colors.text }]}>Music</Text>
            <View style={[styles.readOnlyField, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.readOnlyText, { color: colors.text }]}>
                {post.music?.trackName
                  ? `${post.music.trackName}${post.music.artistName ? ` • ${post.music.artistName}` : ""}`
                  : "Not set"}
              </Text>
            </View>

            {post.hashtags.length ? (
              <>
                <Text style={[styles.label, { color: colors.text }]}>Hashtags</Text>
                <Text style={[styles.entityLine, { color: colors.primary }]}>{post.hashtags.map((tag) => `#${tag}`).join(" ")}</Text>
              </>
            ) : null}

            {post.mentions.length ? (
              <>
                <Text style={[styles.label, { color: colors.text }]}>Mentions</Text>
                <Text style={[styles.entityLine, { color: colors.mutedText }]}>{post.mentions.map((mention) => `@${mention}`).join(" ")}</Text>
              </>
            ) : null}

            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, { color: colors.text }]}>Hide like count</Text>
              <Switch value={hideLikeCount} onValueChange={setHideLikeCount} disabled={!editing} />
            </View>

            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, { color: colors.text }]}>Disable comments</Text>
              <Switch value={disableComments} onValueChange={setDisableComments} disabled={!editing} />
            </View>

            <TouchableOpacity
              style={[
                styles.commentsButton,
                {
                  backgroundColor: colors.primary,
                  borderColor: `${colors.primary}30`,
                },
              ]}
              onPress={() => setActiveSheet("comments")}
            >
              <Text style={styles.commentsButtonText}>Open comments ({post.commentsCount})</Text>
            </TouchableOpacity>

            {canManagePost ? (
              <TouchableOpacity
                style={[
                  styles.deleteButton,
                  {
                    borderColor: `${colors.danger}3a`,
                    backgroundColor: `${colors.danger}14`,
                  },
                ]}
                onPress={deletePost}
              >
                <Text style={[styles.deleteText, { color: colors.danger }]}>Delete Post</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>
      </View>
      <PostCommentsSheet
        visible={activeSheet === "comments"}
        post={post}
        onClose={closeSheet}
        onPostUpdate={setPost}
        onOpenFull={(nextPostId) => navigation.navigate("PostComments", { postId: nextPostId })}
      />

      <PostShareSheet
        visible={activeSheet === "share"}
        post={post}
        onClose={closeSheet}
        onPostUpdate={setPost}
        onOpenStoryComposer={(nextPost) =>
          navigation.navigate("MainApp", {
            screen: "Create",
            params: {
              initialTab: "story",
              initialMedia:
                nextPost.media[0]?.mediaType === "video"
                  ? nextPost.media[0]?.url
                  : nextPost.media[0]?.thumbnailUrl || nextPost.media[0]?.url,
              initialMediaType: nextPost.media[0]?.mediaType || "image",
            },
          })
        }
      />

      <ContentActionSheet
        visible={activeSheet === "actions"}
        contentType="post"
        contentId={post.id}
        userId={post.user.id}
        userLabel={post.user.username}
        title="Post options"
        onClose={closeSheet}
        onActionComplete={(action) => {
          if (action === "archive") {
            navigation.goBack();
            return;
          }

          if (action === "not_interested" || action === "mute" || action === "block") {
            navigation.goBack();
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 18, fontWeight: "700", color: "#111" },
  headerActions: { flexDirection: "row", alignItems: "center" },
  headerActionGap: { marginRight: 10, padding: 2 },
  editButton: { fontSize: 15, color: "#3345d1", fontWeight: "700" },
  mediaSurface: { position: "relative" },
  image: { width: "100%", height: 320, backgroundColor: "#0f172a" },
  stickerLayer: { ...StyleSheet.absoluteFillObject },
  emojiSticker: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  emojiStickerText: { fontSize: 30 },
  textSticker: {
    position: "absolute",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(15,23,42,0.56)",
  },
  textStickerText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  mediaSoundBadge: {
    position: "absolute",
    right: 14,
    bottom: 14,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(15,23,42,0.72)",
    flexDirection: "row",
    alignItems: "center",
  },
  mediaSoundBadgeText: {
    marginLeft: 6,
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  body: { padding: 14 },
  userRow: {
    marginBottom: 10,
  },
  userIdentity: {
    flexDirection: "row",
    alignItems: "center",
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E5E7EB",
  },
  userCopy: {
    marginLeft: 10,
    flex: 1,
  },
  userName: {
    fontSize: 14.5,
    fontWeight: "700",
  },
  userMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
  },
  meta: { color: "#666", fontSize: 12, marginBottom: 4 },
  actionRow: { flexDirection: "row", alignItems: "center", marginTop: 8, marginBottom: 10 },
  actionIcon: { flexDirection: "row", alignItems: "center", marginRight: 18 },
  actionCount: { marginLeft: 6, color: "#111", fontWeight: "700", fontSize: 13 },
  bookmarkIcon: { marginLeft: "auto" },
  label: { marginTop: 14, marginBottom: 6, fontSize: 13, fontWeight: "700", color: "#111" },
  helperText: {
    marginTop: 8,
    color: "#666",
    fontSize: 12,
    lineHeight: 18,
  },
  input: {
    minHeight: 92,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: "top",
  },
  inputSingle: {
    height: 46,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  inputReadOnly: {
    backgroundColor: "#f8f8f8",
  },
  readOnlyField: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 10,
    justifyContent: "center",
    backgroundColor: "#f8f8f8",
  },
  readOnlyText: {
    color: "#222",
  },
  entityLine: {
    color: "#3345d1",
    lineHeight: 20,
  },
  switchRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  switchLabel: { color: "#222", fontWeight: "600" },
  commentsButton: {
    marginTop: 18,
    borderRadius: 10,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  commentsButtonText: { color: "#fff", fontWeight: "700" },
  deleteButton: {
    marginTop: 24,
    borderRadius: 10,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteText: { fontWeight: "700" },
});

export default PostDetailScreen;
