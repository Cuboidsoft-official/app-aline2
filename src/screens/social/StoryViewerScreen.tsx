import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import LinearGradient from "react-native-linear-gradient";
import Icon from "react-native-vector-icons/Ionicons";

import ContentActionSheet from "../../features/social/components/ContentActionSheet";
import StoryActivitySheet from "../../features/social/components/StoryActivitySheet";
import { socialApi } from "../../features/social/socialApi";
import { Story } from "../../features/social/types";
import { toUserSafeMessage } from "../../features/social/validation";

const DEFAULT_STORY_MS = 5000;
const TEXT_STORY_MS = 7000;
const QUICK_REACTIONS = ["❤️", "🔥", "😍", "👏", "😮"];

const formatAgo = (timestamp: number): string => {
  const mins = Math.max(1, Math.floor((Date.now() - timestamp) / (1000 * 60)));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const getStoryDuration = (story: Story | undefined): number => {
  if (!story) {
    return DEFAULT_STORY_MS;
  }

  if (typeof story.media?.durationMs === "number" && story.media.durationMs > 0) {
    return Math.min(Math.max(story.media.durationMs, 4000), 15000);
  }

  return story.type === "text" ? TEXT_STORY_MS : DEFAULT_STORY_MS;
};

const isSyncedStoryId = (storyId: string | undefined): boolean =>
  typeof storyId === "string" && /^[a-fA-F0-9]{24}$/.test(storyId);

function StoryViewerScreen({ route, navigation }: any) {
  const storyId = typeof route?.params?.storyId === "string" ? route.params.storyId : "";
  const storyUserId = typeof route?.params?.storyUserId === "string" ? route.params.storyUserId : undefined;

  const [stories, setStories] = useState<Story[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [replyText, setReplyText] = useState("");
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [liking, setLiking] = useState(false);
  const [busyPollVote, setBusyPollVote] = useState(false);
  const [busyReply, setBusyReply] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showOwnerActivity, setShowOwnerActivity] = useState(false);
  const [ownerActivityTab, setOwnerActivityTab] = useState<"views" | "likes" | "replies">("views");
  const [loadError, setLoadError] = useState("This story may have expired or is no longer visible to you.");
  const replyInputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        if (!storyId) {
          throw new Error("Invalid story id");
        }

        const data = await socialApi.getStorySequence(storyId, { storyUserId });
        if (!data.stories.length || !data.stories[data.startIndex]) {
          throw new Error("Story not found or no longer available.");
        }
        if (mounted) {
          setStories(data.stories);
          setActiveIndex(data.startIndex);
          setLoadError("This story may have expired or is no longer visible to you.");
        }
      } catch (error) {
        if (mounted) {
          setLoadError(toUserSafeMessage(error));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [storyId, storyUserId]);

  const currentStory = useMemo(() => stories[activeIndex], [stories, activeIndex]);
  const storyDuration = useMemo(() => getStoryDuration(currentStory), [currentStory]);
  const canReplyToCurrentStory = !!currentStory && currentStory.allowReplies !== false;
  const canAccessOwnerTools = !!currentStory?.isOwner && isSyncedStoryId(currentStory?.id);

  useEffect(() => {
    setProgress(0);
    setReplyText("");
  }, [activeIndex]);

  useEffect(() => {
    if (!currentStory) {
      return;
    }

    const markSeen = async () => {
      try {
        const updated = await socialApi.markStoryViewed(currentStory.id);
        setStories((prevStories) =>
          prevStories.map((story) => (story.id === updated.id ? updated : story)),
        );
      } catch {
        // Non-blocking.
      }
    };

    markSeen();
  }, [currentStory]);

  useEffect(() => {
    if (!currentStory || paused) {
      return;
    }

    const tick = 100 / storyDuration;
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 1) {
          return 1;
        }

        return Math.min(1, prev + tick);
      });
    }, 100);

    return () => clearInterval(timer);
  }, [currentStory, paused, storyDuration]);

  useEffect(() => {
    if (!currentStory || paused || progress < 1) {
      return;
    }

    if (activeIndex >= stories.length - 1) {
      navigation.goBack();
      return;
    }

    setActiveIndex((prev) => prev + 1);
  }, [activeIndex, currentStory, navigation, paused, progress, stories.length]);

  const next = () => {
    if (activeIndex >= stories.length - 1) {
      navigation.goBack();
      return;
    }

    setActiveIndex((prev) => prev + 1);
  };

  const prev = () => {
    if (activeIndex <= 0) {
      return;
    }

    setActiveIndex((prevIndex) => prevIndex - 1);
  };

  const toggleLike = async () => {
    if (!currentStory || liking || currentStory.liked) {
      return;
    }

    try {
      setLiking(true);
      const updated = await socialApi.toggleStoryLike(currentStory.id);
      setStories((prevStories) => prevStories.map((story) => (story.id === updated.id ? updated : story)));
    } catch (error) {
      Alert.alert("Could not update story", toUserSafeMessage(error));
    } finally {
      setLiking(false);
    }
  };

  const votePoll = async (optionIndex: 0 | 1) => {
    if (!currentStory || busyPollVote) {
      return;
    }

    try {
      setBusyPollVote(true);
      const updated = await socialApi.voteStoryPoll(currentStory.id, optionIndex);
      setStories((prevStories) => prevStories.map((story) => (story.id === updated.id ? updated : story)));
    } catch (error) {
      Alert.alert("Could not vote", toUserSafeMessage(error));
    } finally {
      setBusyPollVote(false);
    }
  };

  const sendReply = async (rawText: string) => {
    if (!currentStory || busyReply || !canReplyToCurrentStory || !rawText.trim()) {
      return;
    }

    try {
      setBusyReply(true);
      await socialApi.replyToStory(currentStory.id, rawText);
      setReplyText("");
      setStories((prevStories) =>
        prevStories.map((story) =>
          story.id === currentStory.id
            ? {
                ...story,
                replyCount: (story.replyCount || 0) + 1,
                question: story.question
                  ? { ...story.question, responseCount: story.question.responseCount + 1 }
                  : undefined,
              }
            : story,
        ),
      );
      Alert.alert("Sent", "Reply sent.");
    } catch (error) {
      Alert.alert("Could not send reply", toUserSafeMessage(error));
    } finally {
      setBusyReply(false);
    }
  };

  const openReplyThread = () => {
    if (!currentStory) {
      return;
    }

    setOwnerActivityTab("replies");
    setShowOwnerActivity(true);
  };

  const focusReplyInput = () => {
    replyInputRef.current?.focus();
  };

  const openOwnerActivity = (tab: "views" | "likes" | "replies") => {
    setOwnerActivityTab(tab);
    setShowOwnerActivity(true);
  };

  const archiveCurrentStory = () => {
    if (!currentStory || !currentStory.isOwner || archiving) {
      return;
    }

    Alert.alert("Archive story", "This story will move to your archive.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive",
        onPress: async () => {
          try {
            setArchiving(true);
            await socialApi.archiveStory(currentStory.id);
            navigation.navigate("StoryArchive");
          } catch (error) {
            Alert.alert("Could not archive story", toUserSafeMessage(error));
          } finally {
            setArchiving(false);
          }
        },
      },
    ]);
  };

  const renderStoryBody = () => {
    if (!currentStory) {
      return null;
    }

    if (currentStory.type === "text") {
      return (
        <View style={[styles.textStoryWrap, { backgroundColor: currentStory.backgroundColor || "#1f2937" }]}>
          <Text style={styles.textStoryContent}>{currentStory.text}</Text>
        </View>
      );
    }

    return (
      <Image
        source={{ uri: currentStory.media?.thumbnailUrl || currentStory.media?.url }}
        style={styles.storyImage}
      />
    );
  };

  const renderStoryOverlay = () => {
    if (!currentStory) {
      return null;
    }

    if (currentStory.type === "poll" && currentStory.poll) {
      const totalVotes = currentStory.poll.votes[0] + currentStory.poll.votes[1] || 1;
      const ratioA = Math.round((currentStory.poll.votes[0] / totalVotes) * 100);
      const ratioB = 100 - ratioA;

      return (
        <View style={styles.stickerBlock}>
          <Text style={styles.stickerTitle}>{currentStory.poll.question}</Text>
          <TouchableOpacity style={styles.pollOption} onPress={() => votePoll(0)}>
            <Text style={styles.pollText}>{currentStory.poll.options[0]}</Text>
            <Text style={styles.pollPercent}>{ratioA}%</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pollOption} onPress={() => votePoll(1)}>
            <Text style={styles.pollText}>{currentStory.poll.options[1]}</Text>
            <Text style={styles.pollPercent}>{ratioB}%</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (currentStory.type === "question" && currentStory.question) {
      return (
        <View style={styles.stickerBlock}>
          <Text style={styles.stickerTitle}>{currentStory.question.prompt}</Text>
          <Text style={styles.stickerSub}>{currentStory.question.responseCount} replies so far</Text>
        </View>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (!currentStory) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.unavailableTitle}>Story unavailable</Text>
        <Text style={styles.unavailableText}>{loadError}</Text>
        <TouchableOpacity style={styles.unavailableButton} onPress={() => navigation.goBack()}>
          <Text style={styles.unavailableButtonText}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {renderStoryBody()}
      <LinearGradient colors={["rgba(0,0,0,0.72)", "rgba(0,0,0,0.15)", "transparent"]} style={styles.topFade} />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.82)"]} style={styles.bottomFade} />

      <View style={styles.progressRow}>
        {stories.map((story, index) => {
          const fill =
            index < activeIndex ? 1 : index === activeIndex ? progress : 0;

          return (
            <View key={story.id} style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${fill * 100}%` }]} />
            </View>
          );
        })}
      </View>

      <View style={styles.header}>
        <Image source={{ uri: currentStory.user.avatarUrl }} style={styles.avatar} />
        <View style={styles.headerMeta}>
          <View style={styles.headerUserRow}>
            <Text style={styles.username}>@{currentStory.user.username}</Text>
            {currentStory.visibility === "close_friends" ? <Text style={styles.closeFriendsBadge}>Close friends</Text> : null}
          </View>
          <Text style={styles.storyMetaLine}>{formatAgo(currentStory.createdAt)} • {currentStory.type}</Text>
        </View>

        {canAccessOwnerTools ? (
          <TouchableOpacity style={styles.iconButton} onPress={() => openOwnerActivity("views")}>
            <Icon name="stats-chart-outline" size={22} color="#fff" />
          </TouchableOpacity>
        ) : !currentStory.isOwner ? (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setShowActions(true)}
          >
            <Icon name="ellipsis-horizontal" size={22} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconButtonSpacer} />
        )}

        <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
          <Icon name="close" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.floatingMeta}>
        {currentStory.music?.trackName ? (
          <View style={styles.metaChip}>
            <Icon name="musical-notes-outline" size={14} color="#fff" />
            <Text style={styles.metaChipText}>
              {currentStory.music.trackName}
              {currentStory.music.artistName ? ` • ${currentStory.music.artistName}` : ""}
            </Text>
          </View>
        ) : null}
        {currentStory.linkUrl ? (
          <View style={styles.metaChip}>
            <Icon name="link-outline" size={14} color="#fff" />
            <Text style={styles.metaChipText}>Tap link available</Text>
          </View>
        ) : null}
      </View>

      <Pressable
        style={styles.leftTouch}
        onPress={prev}
        onPressIn={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
      />
      <Pressable
        style={styles.rightTouch}
        onPress={next}
        onPressIn={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
      />

      <View style={styles.bottomSheet}>
        {renderStoryOverlay()}

        {!currentStory.isOwner && canReplyToCurrentStory ? (
          <View style={styles.quickReactionRow}>
            {QUICK_REACTIONS.map((emoji) => (
              <TouchableOpacity key={emoji} style={styles.emojiChip} onPress={() => sendReply(emoji)}>
                <Text style={styles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {currentStory.isOwner ? (
          <View style={styles.ownerPanel}>
            {canAccessOwnerTools ? (
              <>
                <TouchableOpacity style={styles.ownerMetric} onPress={() => openOwnerActivity("views")}>
                  <Icon name="eye-outline" size={18} color="#fff" />
                  <Text style={styles.ownerMetricText}>{currentStory.viewCount || 0} views</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ownerMetric} onPress={openReplyThread}>
                  <Icon name="chatbubble-ellipses-outline" size={18} color="#fff" />
                  <Text style={styles.ownerMetricText}>{currentStory.replyCount || 0} replies</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ownerMetric} onPress={archiveCurrentStory}>
                  <Icon name="archive-outline" size={18} color="#fff" />
                  <Text style={styles.ownerMetricText}>{archiving ? "Archiving..." : "Archive"}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.ownerHint}>Owner tools are unavailable until this story syncs.</Text>
            )}
          </View>
        ) : (
          <View style={styles.bottomBar}>
            <TextInput
              ref={replyInputRef}
              style={[styles.replyInput, currentStory.allowReplies === false && styles.replyInputDisabled]}
              placeholder={currentStory.allowReplies === false ? "Replies turned off" : "Reply to story"}
              placeholderTextColor="#a7a7a7"
              value={replyText}
              onChangeText={setReplyText}
              editable={currentStory.allowReplies !== false}
            />

            <TouchableOpacity style={styles.bottomIcon} onPress={toggleLike}>
              <Icon
                name={currentStory.liked ? "heart" : "heart-outline"}
                size={24}
                color={currentStory.liked ? "#ff4e77" : "#fff"}
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.bottomIcon} onPress={focusReplyInput}>
              <Icon name="chatbubble-outline" size={22} color="#fff" />
            </TouchableOpacity>

            {currentStory.allowSharing !== false ? (
              <TouchableOpacity
                style={styles.bottomIcon}
                onPress={() =>
                  navigation.navigate("MainApp", {
                    screen: "Create",
                    params: {
                      initialTab: "story",
                      initialMedia: currentStory.media?.url,
                      initialMediaType: currentStory.media?.mediaType,
                    },
                  })
                }
              >
                <Icon name="paper-plane-outline" size={24} color="#fff" />
              </TouchableOpacity>
            ) : null}

            {currentStory.allowReplies !== false ? (
              <TouchableOpacity style={styles.bottomIcon} onPress={() => sendReply(replyText)}>
                <Icon name="send" size={22} color="#fff" />
              </TouchableOpacity>
            ) : (
              <Text style={styles.repliesDisabledText}>Replies off</Text>
            )}
          </View>
        )}
      </View>

      {!currentStory.isOwner ? (
        <ContentActionSheet
          visible={showActions}
          contentType="story"
          contentId={currentStory.id}
          userId={currentStory.user.id}
          userLabel={currentStory.user.username}
          title="Story options"
          onClose={() => setShowActions(false)}
          onActionComplete={(action) => {
            if (action === "not_interested" || action === "mute" || action === "block") {
              navigation.goBack();
            }
          }}
        />
      ) : null}

      {canAccessOwnerTools ? (
        <StoryActivitySheet
          visible={showOwnerActivity}
          storyId={currentStory.id}
          initialTab={ownerActivityTab}
          onClose={() => setShowOwnerActivity(false)}
          onStoryUpdate={(updatedStory) =>
            setStories((prevStories) => prevStories.map((story) => (story.id === updatedStory.id ? updatedStory : story)))
          }
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" },
  unavailableTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  unavailableText: {
    color: "#d1d5db",
    marginTop: 10,
    textAlign: "center",
    paddingHorizontal: 28,
    lineHeight: 20,
  },
  unavailableButton: {
    marginTop: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#fff",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  unavailableButtonText: { color: "#fff", fontWeight: "700" },
  storyImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  topFade: { ...StyleSheet.absoluteFillObject, height: 180 },
  bottomFade: { ...StyleSheet.absoluteFillObject, top: undefined, height: 300, bottom: 0 },
  textStoryWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  textStoryContent: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 38,
  },
  progressRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.28)",
    marginHorizontal: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  headerMeta: { marginLeft: 10, flex: 1 },
  headerUserRow: { flexDirection: "row", alignItems: "center" },
  username: { color: "#fff", fontWeight: "700", fontSize: 14 },
  storyMetaLine: { color: "rgba(255,255,255,0.72)", fontSize: 12, marginTop: 2 },
  closeFriendsBadge: {
    marginLeft: 8,
    color: "#052e16",
    backgroundColor: "#4ade80",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "700",
  },
  iconButton: { marginRight: 10 },
  closeButton: { marginLeft: 2 },
  floatingMeta: { paddingHorizontal: 12, marginTop: 10, gap: 8 },
  metaChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.42)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  metaChipText: { color: "#fff", marginLeft: 7, fontSize: 12.5, fontWeight: "600" },
  leftTouch: {
    position: "absolute",
    left: 0,
    width: "38%",
    top: 0,
    bottom: 0,
  },
  rightTouch: {
    position: "absolute",
    right: 0,
    width: "38%",
    top: 0,
    bottom: 0,
  },
  bottomSheet: { marginTop: "auto", paddingHorizontal: 12, paddingBottom: 18 },
  stickerBlock: {
    backgroundColor: "rgba(0,0,0,0.42)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  stickerTitle: { color: "#fff", fontSize: 15, fontWeight: "700", marginBottom: 8 },
  stickerSub: { color: "#d4d4d4", fontSize: 12.5 },
  pollOption: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pollText: { color: "#fff", fontWeight: "600" },
  pollPercent: { color: "#fff", fontWeight: "700" },
  quickReactionRow: { flexDirection: "row", marginBottom: 10, flexWrap: "wrap" },
  emojiChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.35)",
    marginRight: 8,
    marginBottom: 6,
  },
  emojiText: { fontSize: 15 },
  ownerPanel: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.38)",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: "space-between",
  },
  ownerHint: { color: "#fff", fontWeight: "600", fontSize: 12.5 },
  ownerMetric: { flexDirection: "row", alignItems: "center" },
  ownerMetricText: { color: "#fff", marginLeft: 6, fontWeight: "700", fontSize: 12.5 },
  iconButtonSpacer: { width: 36, height: 36 },
  bottomBar: { flexDirection: "row", alignItems: "center" },
  replyInput: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    color: "#fff",
    paddingHorizontal: 14,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  replyInputDisabled: { opacity: 0.6 },
  bottomIcon: { marginLeft: 12 },
  repliesDisabledText: { color: "#d4d4d4", marginLeft: 12, fontSize: 12.5, fontWeight: "600" },
});

export default StoryViewerScreen;
