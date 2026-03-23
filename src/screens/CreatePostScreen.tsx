import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../api/api";
import {
  ComposerAsset,
  createRemoteComposerAsset,
  pickComposerAssets,
  uploadComposerAssets,
} from "../features/social/mediaUpload";
import { socialApi } from "../features/social/socialApi";
import {
  CreatePostInput,
  CreateSwipeInput,
  CreateStoryInput,
  PostType,
  StoryType,
  Visibility,
} from "../features/social/types";
import { limits, parseCaptionEntities, toUserSafeMessage } from "../features/social/validation";

type ComposerTab = "post" | "story" | "swipe";

const tabs: ComposerTab[] = ["post", "story", "swipe"];
const postModes: PostType[] = ["photo", "video", "carousel"];
const storyModes: StoryType[] = ["media", "poll", "question"];
const MAX_CAROUSEL_ITEMS = 10;

type AudienceCandidate = {
  id: string;
  username: string;
  name: string;
};

const splitTokens = (raw: string): string[] =>
  raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => token.replace(/^[@#]/, ""));

const appendCaptionEntities = (baseCaption: string, hashtags: string[], mentions: string[]): string => {
  const caption = baseCaption.trim();
  const existingHashtags = new Set((caption.match(/#([a-zA-Z0-9_.]{1,30})/g) || []).map((token) => token.slice(1).toLowerCase()));
  const existingMentions = new Set((caption.match(/@([a-zA-Z0-9_.]{1,30})/g) || []).map((token) => token.slice(1).toLowerCase()));

  const appendedHashtags = hashtags.filter((tag) => !existingHashtags.has(tag.toLowerCase())).map((tag) => `#${tag}`);
  const appendedMentions = mentions.filter((mention) => !existingMentions.has(mention.toLowerCase())).map((mention) => `@${mention}`);

  return [caption, ...appendedHashtags, ...appendedMentions].filter(Boolean).join(" ").trim();
};

const isRemoteImage = (asset: ComposerAsset | undefined): boolean => !!asset && asset.source === "remote" && asset.mediaType === "image";

function CreatePostScreen({ navigation, route }: any) {
  const initialTab = (route?.params?.initialTab as ComposerTab | undefined) || "post";
  const initialMedia = route?.params?.initialMedia as string | undefined;
  const initialMediaType = (route?.params?.initialMediaType as "image" | "video" | undefined) || "image";

  const [activeTab, setActiveTab] = useState<ComposerTab>(initialTab);
  const [publishing, setPublishing] = useState(false);
  const [pickingMedia, setPickingMedia] = useState(false);

  const [postType, setPostType] = useState<PostType>("photo");
  const [storyType, setStoryType] = useState<StoryType>("media");

  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [music, setMusic] = useState("");

  const [hashtagsRaw, setHashtagsRaw] = useState("");
  const [mentionsRaw, setMentionsRaw] = useState("");
  const [collabsRaw, setCollabsRaw] = useState("");

  const [disableComments, setDisableComments] = useState(false);
  const [hideLikeCount, setHideLikeCount] = useState(false);
  const [allowRemix, setAllowRemix] = useState(true);

  const [selectedAssets, setSelectedAssets] = useState<ComposerAsset[]>(
    initialMedia ? [createRemoteComposerAsset(initialMedia, initialMediaType)] : [],
  );

  const [storyCaption, setStoryCaption] = useState("");
  const [storyVisibility, setStoryVisibility] = useState<Visibility>("public");
  const [storyVisibleToUserIds, setStoryVisibleToUserIds] = useState<string[]>([]);
  const [storyAudienceCandidates, setStoryAudienceCandidates] = useState<AudienceCandidate[]>([]);
  const [storyAudienceLoading, setStoryAudienceLoading] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptionA, setPollOptionA] = useState("Yes");
  const [pollOptionB, setPollOptionB] = useState("No");
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [storyAllowReplies, setStoryAllowReplies] = useState(true);
  const [storyAllowSharing, setStoryAllowSharing] = useState(true);
  const [storyMusicTrack, setStoryMusicTrack] = useState("");
  const [storyMusicArtist, setStoryMusicArtist] = useState("");

  useEffect(() => {
    const routeTab = route?.params?.initialTab as ComposerTab | undefined;
    const routeMedia = route?.params?.initialMedia as string | undefined;
    const routeMediaTypeParam = route?.params?.initialMediaType as "image" | "video" | undefined;
    const routeMediaType = routeMediaTypeParam || "image";

    if (!routeTab && !routeMedia && !routeMediaTypeParam) {
      return;
    }

    if (routeTab) {
      setActiveTab(routeTab);
    }

    if (routeMedia) {
      setSelectedAssets([createRemoteComposerAsset(routeMedia, routeMediaType)]);
    }

    navigation.setParams({
      initialTab: undefined,
      initialMedia: undefined,
      initialMediaType: undefined,
    });
  }, [navigation, route?.params]);

  const primaryAsset = useMemo(() => selectedAssets[0] || null, [selectedAssets]);

  useEffect(() => {
    if (activeTab !== "story" || storyVisibility !== "custom" || storyAudienceCandidates.length || storyAudienceLoading) {
      return;
    }

    let mounted = true;

    const loadStoryAudience = async () => {
      try {
        setStoryAudienceLoading(true);
        const res = await API.get("/auth/users");
        const users = Array.isArray(res?.data?.users) ? res.data.users : [];

        if (!mounted) {
          return;
        }

        setStoryAudienceCandidates(
          users.map((user: any) => ({
            id: String(user?._id || user?.id || ""),
            username: String(user?.username || ""),
            name: String(user?.name || user?.username || "User"),
          })).filter((user: AudienceCandidate) => !!user.id),
        );
      } catch (error) {
        if (mounted) {
          Alert.alert("Could not load audience", toUserSafeMessage(error));
        }
      } finally {
        if (mounted) {
          setStoryAudienceLoading(false);
        }
      }
    };

    loadStoryAudience();

    return () => {
      mounted = false;
    };
  }, [activeTab, storyAudienceCandidates.length, storyAudienceLoading, storyVisibility]);

  const resetAssetsForTab = (tab: ComposerTab) => {
    if (tab === "story" && initialMedia) {
      setSelectedAssets([createRemoteComposerAsset(initialMedia, initialMediaType)]);
      return;
    }

    setSelectedAssets([]);
  };

  const onSelectTab = (tab: ComposerTab) => {
    setActiveTab(tab);
    resetAssetsForTab(tab);
  };

  const onPickMedia = async () => {
    if (pickingMedia) {
      return;
    }

    const pickerMediaType =
      activeTab === "story"
        ? "mixed"
        : activeTab === "swipe" || postType === "video"
        ? "video"
        : "photo";
    const selectionLimit = activeTab === "post" && postType === "carousel" ? MAX_CAROUSEL_ITEMS : 1;

    try {
      setPickingMedia(true);
      const pickedAssets = await pickComposerAssets({
        mediaType: pickerMediaType,
        selectionLimit,
        quality: 0.9,
        presentationStyle: "fullScreen",
      });

      if (!pickedAssets.length) {
        return;
      }

      if (activeTab === "post" && postType === "carousel") {
        setSelectedAssets(pickedAssets.slice(0, MAX_CAROUSEL_ITEMS));
        return;
      }

      setSelectedAssets([pickedAssets[0]]);
    } catch (error) {
      Alert.alert("Could not pick media", toUserSafeMessage(error));
    } finally {
      setPickingMedia(false);
    }
  };

  const removeAsset = (assetId: string) => {
    setSelectedAssets((prev) => prev.filter((asset) => asset.id !== assetId));
  };

  const toggleStoryAudienceUser = (userId: string) => {
    setStoryVisibleToUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const requireAssets = (message: string): ComposerAsset[] => {
    if (!selectedAssets.length) {
      throw new Error(message);
    }

    return selectedAssets;
  };

  const preparePostPayload = async (): Promise<CreatePostInput> => {
    const enteredHashtags = splitTokens(hashtagsRaw);
    const enteredMentions = splitTokens(mentionsRaw);
    const captionEntities = parseCaptionEntities(caption);
    const hashtags = Array.from(new Set([...enteredHashtags, ...captionEntities.hashtags]));
    const mentions = Array.from(new Set([...enteredMentions, ...captionEntities.mentions]));
    const assets = requireAssets("Choose media before publishing this post.");

    if (postType === "carousel" && assets.some((asset) => asset.mediaType !== "image")) {
      throw new Error("Carousel posts support images only.");
    }

    if (postType === "photo" && assets[0]?.mediaType !== "image") {
      throw new Error("Photo posts require an image.");
    }

    if (postType === "video" && assets[0]?.mediaType !== "video") {
      throw new Error("Video posts require a video file.");
    }

    const media = await uploadComposerAssets(postType === "carousel" ? assets : [assets[0]]);

    return {
      type: postType,
      caption: appendCaptionEntities(caption, hashtags, mentions),
      media,
      location,
      music,
      hashtags,
      mentions,
      collaboratorIds: splitTokens(collabsRaw),
      settings: {
        disableComments,
        hideLikeCount,
        allowRemix,
      },
    };
  };

  const prepareStoryPayload = async (): Promise<CreateStoryInput> => {
    const assets = requireAssets("Choose media before publishing this story.");
    const [background] = await uploadComposerAssets([assets[0]]);

    if (storyType !== "media" && background.mediaType !== "image") {
      throw new Error("Poll and question stories currently require an image background.");
    }

    const base: CreateStoryInput = {
      type: storyType,
      media: background,
      text: storyCaption.trim() || undefined,
      visibility: storyVisibility,
      visibleToUserIds: storyVisibility === "custom" ? storyVisibleToUserIds : undefined,
      allowReplies: storyAllowReplies,
      allowSharing: storyAllowSharing,
      music: storyMusicTrack
        ? {
            trackName: storyMusicTrack,
            artistName: storyMusicArtist || undefined,
          }
        : undefined,
    };

    if (storyType === "poll") {
      base.poll = {
        question: pollQuestion,
        options: [pollOptionA, pollOptionB],
      };
    }

    if (storyType === "question") {
      base.question = {
        prompt: questionPrompt,
      };
    }

    return base;
  };

  const prepareSwipePayload = async (): Promise<CreateSwipeInput> => {
    const assets = requireAssets("Choose a video before publishing this swipe.");
    const [video] = await uploadComposerAssets([assets[0]]);

    if (video.mediaType !== "video") {
      throw new Error("Swipes require a video upload.");
    }

    return {
      caption: appendCaptionEntities(caption, splitTokens(hashtagsRaw), splitTokens(mentionsRaw)),
      media: video,
      thumbnailUrl: video.thumbnailUrl,
      music,
      location,
      hashtags: splitTokens(hashtagsRaw),
      mentions: splitTokens(mentionsRaw),
    };
  };

  const publish = async () => {
    if (publishing) {
      return;
    }

    try {
      setPublishing(true);

      if (activeTab === "post") {
        await socialApi.createPost(await preparePostPayload());
      } else if (activeTab === "story") {
        await socialApi.createStory(await prepareStoryPayload());
      } else {
        await socialApi.createSwipe(await prepareSwipePayload());
      }

      const publishedType = activeTab === "swipe" ? "swipe" : activeTab;
      Alert.alert("Published", `Your ${publishedType} is now live.`);
      navigation.navigate(activeTab === "swipe" ? "Swipes" : "Feed");
    } catch (error) {
      Alert.alert("Publish failed", toUserSafeMessage(error));
    } finally {
      setPublishing(false);
    }
  };

  const renderMediaPreview = () => {
    if (!primaryAsset) {
      return (
        <View style={styles.emptyPreview}>
          <Icon name="images-outline" size={36} color="#6b7280" />
          <Text style={styles.emptyPreviewTitle}>No media selected</Text>
          <Text style={styles.emptyPreviewText}>Pick media from your device before publishing.</Text>
        </View>
      );
    }

    if (primaryAsset.mediaType === "video" && !primaryAsset.thumbnailUrl && !isRemoteImage(primaryAsset)) {
      return (
        <View style={styles.videoPreviewCard}>
          <Icon name="videocam-outline" size={40} color="#fff" />
          <Text style={styles.videoPreviewTitle}>Video selected</Text>
          <Text style={styles.videoPreviewText}>{primaryAsset.fileName || "Ready to upload"}</Text>
        </View>
      );
    }

    return (
      <Image
        source={{ uri: primaryAsset.thumbnailUrl || primaryAsset.uri }}
        style={styles.preview}
      />
    );
  };

  const renderSelectedAssets = () => {
    if (!selectedAssets.length) {
      return null;
    }

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.assetRow}>
        {selectedAssets.map((asset) => (
          <View key={asset.id} style={styles.assetChip}>
            {asset.mediaType === "video" && !asset.thumbnailUrl && asset.source === "local" ? (
              <View style={[styles.assetThumb, styles.assetThumbVideo]}>
                <Icon name="videocam-outline" size={18} color="#fff" />
              </View>
            ) : (
              <Image source={{ uri: asset.thumbnailUrl || asset.uri }} style={styles.assetThumb} />
            )}
            <TouchableOpacity style={styles.assetRemove} onPress={() => removeAsset(asset.id)}>
              <Icon name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderPostControls = () => (
    <>
      <Text style={styles.sectionLabel}>Post Type</Text>
      <View style={styles.modeRow}>
        {postModes.map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.pill, postType === mode && styles.pillActive]}
            onPress={() => {
              setPostType(mode);
              setSelectedAssets([]);
            }}
          >
            <Text style={[styles.pillText, postType === mode && styles.pillTextActive]}>{mode}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Caption</Text>
      <TextInput
        style={styles.input}
        value={caption}
        onChangeText={setCaption}
        placeholder="Write caption"
        multiline
        maxLength={limits.caption}
      />
      <Text style={styles.counter}>{caption.length}/{limits.caption}</Text>

      <Text style={styles.sectionLabel}>Location</Text>
      <TextInput style={styles.inputSingle} value={location} onChangeText={setLocation} placeholder="Add location" maxLength={limits.location} />

      <Text style={styles.sectionLabel}>Music</Text>
      <TextInput style={styles.inputSingle} value={music} onChangeText={setMusic} placeholder="Track name" maxLength={limits.music} />

      <Text style={styles.sectionLabel}>Hashtags (comma separated)</Text>
      <TextInput style={styles.inputSingle} value={hashtagsRaw} onChangeText={setHashtagsRaw} placeholder="fashion, travel" />

      <Text style={styles.sectionLabel}>Mentions (comma separated)</Text>
      <TextInput style={styles.inputSingle} value={mentionsRaw} onChangeText={setMentionsRaw} placeholder="alice, bob" />

      <Text style={styles.sectionLabel}>Collaborators (comma separated user ids)</Text>
      <TextInput style={styles.inputSingle} value={collabsRaw} onChangeText={setCollabsRaw} placeholder="u2, u3" />

      <View style={styles.switchRow}><Text style={styles.switchLabel}>Disable comments</Text><Switch value={disableComments} onValueChange={setDisableComments} /></View>
      <View style={styles.switchRow}><Text style={styles.switchLabel}>Hide like count</Text><Switch value={hideLikeCount} onValueChange={setHideLikeCount} /></View>
      <View style={styles.switchRow}><Text style={styles.switchLabel}>Allow remix</Text><Switch value={allowRemix} onValueChange={setAllowRemix} /></View>

      <Text style={styles.helperText}>
        {postType === "carousel"
          ? "Select up to 10 images for a carousel post."
          : postType === "video"
            ? "Choose a single video. It will upload through the backend media pipeline."
            : "Choose a single image for this post."}
      </Text>
    </>
  );

  const renderStoryControls = () => (
    <>
      <Text style={styles.sectionLabel}>Story Type</Text>
      <View style={styles.modeRow}>
        {storyModes.map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.pill, storyType === mode && styles.pillActive]}
            onPress={() => setStoryType(mode)}
          >
            <Text style={[styles.pillText, storyType === mode && styles.pillTextActive]}>{mode}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {storyType === "poll" ? (
        <>
      <Text style={styles.sectionLabel}>Poll Question</Text>
          <TextInput style={styles.inputSingle} value={pollQuestion} onChangeText={setPollQuestion} placeholder="Ask a poll question" />
          <Text style={styles.sectionLabel}>Option A</Text>
          <TextInput style={styles.inputSingle} value={pollOptionA} onChangeText={setPollOptionA} placeholder="Option A" />
          <Text style={styles.sectionLabel}>Option B</Text>
          <TextInput style={styles.inputSingle} value={pollOptionB} onChangeText={setPollOptionB} placeholder="Option B" />
        </>
      ) : null}

      {storyType === "question" ? (
        <>
      <Text style={styles.sectionLabel}>Question Prompt</Text>
          <TextInput style={styles.inputSingle} value={questionPrompt} onChangeText={setQuestionPrompt} placeholder="Ask followers anything" />
        </>
      ) : null}

      <Text style={styles.sectionLabel}>Caption</Text>
      <TextInput
        style={styles.input}
        value={storyCaption}
        onChangeText={setStoryCaption}
        placeholder="Add story caption"
        maxLength={limits.caption}
        multiline
      />
      <Text style={styles.counter}>{storyCaption.length}/{limits.caption}</Text>

      <Text style={styles.sectionLabel}>Audience</Text>
      <View style={styles.modeRow}>
        {(["public", "friends", "close_friends", "custom"] as Visibility[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.pill, storyVisibility === mode && styles.pillActive]}
            onPress={() => setStoryVisibility(mode)}
          >
            <Text style={[styles.pillText, storyVisibility === mode && styles.pillTextActive]}>{mode}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {storyVisibility === "custom" ? (
        <>
          <Text style={styles.sectionLabel}>Custom audience</Text>
          {storyAudienceLoading ? (
            <ActivityIndicator size="small" color="#111827" />
          ) : (
            <View style={styles.audienceWrap}>
              {storyAudienceCandidates.map((user) => {
                const selected = storyVisibleToUserIds.includes(user.id);
                return (
                  <TouchableOpacity
                    key={user.id}
                    style={[styles.audienceChip, selected && styles.audienceChipSelected]}
                    onPress={() => toggleStoryAudienceUser(user.id)}
                  >
                    <Text style={[styles.audienceChipText, selected && styles.audienceChipTextSelected]}>
                      @{user.username}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          <Text style={styles.helperText}>Only selected users will be able to view this story.</Text>
        </>
      ) : null}

      <Text style={styles.sectionLabel}>Music</Text>
      <TextInput style={styles.inputSingle} value={storyMusicTrack} onChangeText={setStoryMusicTrack} placeholder="Track name" maxLength={limits.music} />
      <Text style={styles.sectionLabel}>Artist</Text>
      <TextInput style={styles.inputSingle} value={storyMusicArtist} onChangeText={setStoryMusicArtist} placeholder="Artist name" maxLength={limits.music} />

      <View style={styles.switchRow}><Text style={styles.switchLabel}>Allow replies</Text><Switch value={storyAllowReplies} onValueChange={setStoryAllowReplies} /></View>
      <View style={styles.switchRow}><Text style={styles.switchLabel}>Allow sharing</Text><Switch value={storyAllowSharing} onValueChange={setStoryAllowSharing} /></View>

      <Text style={styles.helperText}>
        Story links and free-form mention or hashtag metadata are hidden here because the current backend does not persist them safely.
      </Text>
    </>
  );

  const renderSwipeControls = () => (
    <>
      <Text style={styles.sectionLabel}>Caption</Text>
      <TextInput style={styles.input} value={caption} onChangeText={setCaption} placeholder="Write swipe caption" maxLength={limits.caption} multiline />
      <Text style={styles.counter}>{caption.length}/{limits.caption}</Text>

      <Text style={styles.sectionLabel}>Music</Text>
      <TextInput style={styles.inputSingle} value={music} onChangeText={setMusic} placeholder="Track name" maxLength={limits.music} />

      <Text style={styles.sectionLabel}>Location</Text>
      <TextInput style={styles.inputSingle} value={location} onChangeText={setLocation} placeholder="Add location" maxLength={limits.location} />

      <Text style={styles.sectionLabel}>Hashtags</Text>
      <TextInput style={styles.inputSingle} value={hashtagsRaw} onChangeText={setHashtagsRaw} placeholder="fitlife, travel" />

      <Text style={styles.sectionLabel}>Mentions</Text>
      <TextInput style={styles.inputSingle} value={mentionsRaw} onChangeText={setMentionsRaw} placeholder="alice, bob" />

      <Text style={styles.helperText}>Swipes require a single short-form video. The backend will create a thumbnail automatically.</Text>
    </>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}><Text style={styles.headerTitle}>Advanced Create</Text></View>

      <View style={styles.tabsRow}>
        {tabs.map((tab) => (
          <TouchableOpacity key={tab} style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]} onPress={() => onSelectTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {renderMediaPreview()}

        <View style={styles.mediaSectionHeader}>
          <Text style={styles.sectionLabel}>Media</Text>
          <TouchableOpacity style={styles.pickButton} disabled={pickingMedia} onPress={onPickMedia}>
            {pickingMedia ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="images-outline" size={18} color="#fff" />}
            <Text style={styles.pickButtonText}>{selectedAssets.length ? "Replace" : "Choose"}</Text>
          </TouchableOpacity>
        </View>

        {renderSelectedAssets()}

        {activeTab === "post" ? renderPostControls() : null}
        {activeTab === "story" ? renderStoryControls() : null}
        {activeTab === "swipe" ? renderSwipeControls() : null}

        <TouchableOpacity
          style={[styles.publishButton, publishing && styles.publishButtonDisabled]}
          onPress={publish}
          disabled={publishing}
        >
          <Icon name="cloud-upload-outline" size={18} color="#fff" />
          <Text style={styles.publishText}>
            {publishing ? "Publishing..." : `Publish ${activeTab}`}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    paddingTop: 44,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#171717" },
  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#dadada",
    borderRadius: 14,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: "#0f0f0f",
    borderColor: "#0f0f0f",
  },
  tabText: { fontWeight: "700", color: "#595959", fontSize: 12 },
  tabTextActive: { color: "#fff" },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 32 },
  preview: {
    width: "100%",
    height: 250,
    borderRadius: 18,
    backgroundColor: "#efefef",
  },
  emptyPreview: {
    height: 250,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 24,
  },
  emptyPreviewTitle: { marginTop: 12, fontSize: 16, fontWeight: "700", color: "#111827" },
  emptyPreviewText: { marginTop: 6, textAlign: "center", color: "#6b7280", lineHeight: 20 },
  videoPreviewCard: {
    height: 250,
    borderRadius: 18,
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
  },
  videoPreviewTitle: { marginTop: 12, color: "#fff", fontSize: 18, fontWeight: "700" },
  videoPreviewText: { marginTop: 6, color: "#cbd5e1" },
  mediaSectionHeader: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLabel: { marginTop: 16, marginBottom: 8, fontSize: 13, fontWeight: "700", color: "#111" },
  pickButton: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#111827",
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 38,
  },
  pickButtonText: { color: "#fff", fontWeight: "700" },
  assetRow: { paddingTop: 12, paddingBottom: 4 },
  assetChip: { marginRight: 10, position: "relative" },
  assetThumb: { width: 76, height: 76, borderRadius: 14, backgroundColor: "#e5e7eb" },
  assetThumbVideo: { justifyContent: "center", alignItems: "center", backgroundColor: "#111827" },
  assetRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(17,24,39,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  modeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: {
    borderWidth: 1,
    borderColor: "#d7d7d7",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pillActive: { backgroundColor: "#111827", borderColor: "#111827" },
  pillText: { color: "#444", fontWeight: "700" },
  pillTextActive: { color: "#fff" },
  audienceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  audienceChip: {
    borderWidth: 1,
    borderColor: "#d7d7d7",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  audienceChipSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  audienceChipText: { color: "#374151", fontWeight: "600" },
  audienceChipTextSelected: { color: "#fff" },
  input: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlignVertical: "top",
  },
  inputSingle: {
    height: 48,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  counter: { marginTop: 6, color: "#666", fontSize: 12 },
  switchRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  switchLabel: { color: "#222", fontWeight: "600" },
  helperText: { marginTop: 10, color: "#6b7280", lineHeight: 20 },
  publishButton: {
    marginTop: 26,
    borderRadius: 16,
    backgroundColor: "#111827",
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  publishButtonDisabled: { opacity: 0.7 },
  publishText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});

export default CreatePostScreen;
