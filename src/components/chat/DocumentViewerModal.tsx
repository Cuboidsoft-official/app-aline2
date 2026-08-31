import SocialVideo from "../../features/social/components/SocialVideo";
import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
  SafeAreaView,
  StatusBar,
  Platform,
  ScrollView,
} from "react-native";
import { WebView } from "react-native-webview";
import Icon from "react-native-vector-icons/Ionicons";
import { normalizeMediaUrl } from "../../utils/mediaUrls";
import MediaPreviewActionsModal from "./MediaPreviewActionsModal";
import PinchZoomImage, { PinchZoomImageHandle } from "./PinchZoomImage";

interface DocumentViewerModalProps {
  visible: boolean;
  url: string | null | undefined;
  fileName?: string | null;
  onClose: () => void;
  onAddToStory?: (mediaUrl: string, mediaType: "image" | "video") => void;
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i;
const DOC_EXTENSIONS = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|webm|mkv|3gp)$/i;
const HEADER_HEIGHT = 56;

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  visible,
  url,
  fileName,
  onClose,
  onAddToStory,
}) => {
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showActionsModal, setShowActionsModal] = useState(false);
  const imageViewerRef = useRef<PinchZoomImageHandle>(null);

  // The header now floats above full-bleed content instead of pushing it
  // down, so images/videos render edge-to-edge with no reserved gap. The
  // PDF/document WebView still needs a top offset so it doesn't render
  // underneath the floating header buttons; compute it dynamically instead
  // of a fixed guess so it works across different status bar heights.
  const headerOffset = HEADER_HEIGHT + (Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 4 : 4);

  const targetUrl = useMemo(() => {
    return normalizeMediaUrl(url || "");
  }, [url]);

  const displayName = useMemo(() => {
    if (fileName && fileName.trim()) {
      return fileName.trim();
    }
    if (!targetUrl) {
      return "Document";
    }
    try {
      const cleanUrl = targetUrl.split("?")[0].split("#")[0];
      const parts = cleanUrl.split("/");
      const lastPart = parts[parts.length - 1];
      if (lastPart && lastPart.includes(".")) {
        return decodeURIComponent(lastPart);
      }
    } catch {
      // Fallback below
    }
    return "Document";
  }, [fileName, targetUrl]);

  const isImage = useMemo(() => {
    if (!targetUrl) return false;
    return (
      IMAGE_EXTENSIONS.test(targetUrl) ||
      targetUrl.startsWith("data:image/")
    );
  }, [targetUrl]);

  const isVideo = useMemo(() => {
    if (!targetUrl) return false;
    return (
      VIDEO_EXTENSIONS.test(targetUrl) ||
      targetUrl.startsWith("data:video/") ||
      targetUrl.includes(".mp4") ||
      targetUrl.includes(".mov")
    );
  }, [targetUrl]);

  const isLocalFile = useMemo(() => {
    if (!targetUrl) return false;
    return (
      targetUrl.startsWith("file://") ||
      targetUrl.startsWith("content://")
    );
  }, [targetUrl]);

  const webViewSource = useMemo(() => {
    if (!targetUrl) {
      return { uri: "" };
    }

    if (isLocalFile || isImage) {
      return { uri: targetUrl };
    }

    // For remote documents (PDFs, DOC, DOCX, XLS, etc.), use Google Docs Viewer for reliable inline display
    const isDoc = DOC_EXTENSIONS.test(targetUrl) || !isImage;
    if (isDoc && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      return {
        uri: `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(targetUrl)}`,
      };
    }

    return { uri: targetUrl };
  }, [targetUrl, isLocalFile, isImage]);

  useEffect(() => {
    if (visible) {
      setHasError(false);
      setLoading(!isImage && !isVideo);
    }
  }, [visible, isImage, isVideo, targetUrl]);

  const handleOpenExternal = async () => {
    if (!targetUrl) {
      Alert.alert("Error", "Document URL is unavailable.");
      return;
    }
    try {
      const canOpen = await Linking.canOpenURL(targetUrl);
      if (canOpen) {
        await Linking.openURL(targetUrl);
      } else {
        Alert.alert("Unable to open", "No application found to open this document.");
      }
    } catch (error) {
      console.log("External document open error:", error);
      Alert.alert("Error", "Could not open document externally.");
    }
  };

  const handleRetry = () => {
    setHasError(false);
    setLoading(true);
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        {/* Content Body (full-bleed, no reserved header space) */}
        <View style={styles.body}>
          {!targetUrl ? (
            <View style={styles.errorContainer}>
              <Icon name="alert-circle-outline" size={48} color="#EF4444" />
              <Text style={styles.errorText}>Document URL is unavailable.</Text>
            </View>
          ) : isVideo ? (
            <View style={styles.videoContainer}>
              <SocialVideo
                uri={targetUrl}
                controls={true}
                paused={false}
                resizeMode="contain"
                style={StyleSheet.absoluteFill}
              />
            </View>
          ) : isImage ? (
            <PinchZoomImage
              ref={imageViewerRef}
              uri={targetUrl}
              onLoad={() => setLoading(false)}
              onError={(err) => {
                console.log("Image preview load error:", err?.nativeEvent);
                setLoading(false);
                setHasError(true);
              }}
            />
          ) : (
            <ScrollView
              style={[styles.docScroll, { marginTop: headerOffset }]}
              contentContainerStyle={{ flex: 1, width: "100%", height: "100%" }}
              maximumZoomScale={5}
              minimumZoomScale={1}
              bouncesZoom={true}
              pinchGestureEnabled={true}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <WebView
                key={webViewSource.uri}
                source={webViewSource}
                style={styles.webView}
                startInLoadingState
                javaScriptEnabled
                domStorageEnabled
                allowFileAccess
                allowFileAccessFromFileURLs
                allowUniversalAccessFromFileURLs
                originWhitelist={["*"]}
                scalesPageToFit={true}
                pinchGestureEnabled={true}
                setBuiltInZoomControls={true}
                setDisplayZoomControls={false}
                onLoadStart={() => {
                  setLoading(true);
                  setHasError(false);
                }}
                onLoadEnd={() => setLoading(false)}
                onError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.log("WebView document load error:", nativeEvent);
                  setLoading(false);
                  setHasError(true);
                }}
                renderLoading={() => <ActivityIndicator size="large" color="#8B5CF6" />}
              />
            </ScrollView>
          )}

          {/* Loading Indicator */}
          {loading && !hasError && (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color="#8B5CF6" />
              <Text style={styles.loadingText}>Opening document...</Text>
            </View>
          )}

          {/* Error / Retry Fallback */}
          {hasError && (
            <View style={styles.errorOverlay}>
              <Icon name="document-attach-outline" size={54} color="#A1A1AA" />
              <Text style={styles.errorTitle}>Could not load document preview</Text>
              <Text style={styles.errorSubtext}>{displayName}</Text>
              <View style={styles.errorActions}>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={handleRetry}
                  activeOpacity={0.8}
                >
                  <Icon name="refresh-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.externalButton}
                  onPress={handleOpenExternal}
                  activeOpacity={0.8}
                >
                  <Icon name="open-outline" size={18} color="#8B5CF6" style={{ marginRight: 6 }} />
                  <Text style={styles.externalButtonText}>Open External App</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Floating header, overlaid on top of full-bleed content */}
        <SafeAreaView style={styles.headerSafeArea} pointerEvents="box-none">
          <View style={styles.header} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.headerButton}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.titleContainer}>
              <Icon
                name={isImage ? "image-outline" : isVideo ? "videocam-outline" : "document-text-outline"}
                size={18}
                color="#A1A1AA"
                style={styles.titleIcon}
              />
            </View>

            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowActionsModal(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="ellipsis-vertical" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        <MediaPreviewActionsModal
          visible={showActionsModal}
          onClose={() => setShowActionsModal(false)}
          mediaUrl={targetUrl}
          fileName={displayName}
          mediaType={isImage ? "image" : isVideo ? "video" : undefined}
          captureImage={isImage ? async () => {
            const uri = await imageViewerRef.current?.captureAsync();
            if (!uri) {
              throw new Error("Image capture is unavailable.");
            }
            return uri;
          } : undefined}
          onAddToStory={() => {
            onClose();
            onAddToStory?.(targetUrl, isVideo ? "video" : "image");
          }}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  headerSafeArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 4 : 4,
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  titleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 12,
  },
  titleIcon: {
    marginRight: 6,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    maxWidth: "80%",
  },
  body: {
    flex: 1,
    backgroundColor: "#000000",
    position: "relative",
  },
  videoContainer: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  docScroll: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#0F0F12",
  },
  webView: {
    flex: 1,
    backgroundColor: "#0F0F12",
  },
  imageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000000",
  },
  imageScroll: {
    flex: 1,
    width: "100%",
  },
  imageScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  imagePreview: {
    width: "100%",
    height: "100%",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 15, 18, 0.88)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  loadingText: {
    color: "#E4E4E7",
    fontSize: 15,
    marginTop: 12,
    fontWeight: "500",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 16,
    marginTop: 12,
    textAlign: "center",
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0F0F12",
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
    zIndex: 20,
  },
  errorTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
    textAlign: "center",
  },
  errorSubtext: {
    color: "#A1A1AA",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  errorActions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    gap: 12,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#8B5CF6",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  externalButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(139, 92, 246, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.4)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  externalButtonText: {
    color: "#8B5CF6",
    fontSize: 15,
    fontWeight: "600",
  },
});

export default DocumentViewerModal;
