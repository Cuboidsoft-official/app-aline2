import React, { useState, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
  Image,
  SafeAreaView,
  StatusBar,
  Platform,
  ScrollView,
} from "react-native";
import { WebView } from "react-native-webview";
import Icon from "react-native-vector-icons/Ionicons";
import { normalizeMediaUrl } from "../../utils/mediaUrls";
import MediaPreviewActionsModal from "./MediaPreviewActionsModal";

interface DocumentViewerModalProps {
  visible: boolean;
  url: string | null | undefined;
  fileName?: string | null;
  onClose: () => void;
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i;
const DOC_EXTENSIONS = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i;

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  visible,
  url,
  fileName,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showActionsModal, setShowActionsModal] = useState(false);

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
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F12" />

        {/* Header */}
        <View style={styles.header}>
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
              name={isImage ? "image-outline" : "document-text-outline"}
              size={18}
              color="#A1A1AA"
              style={styles.titleIcon}
            />
            <Text style={styles.headerTitle} numberOfLines={1}>
              {displayName}
            </Text>
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

        {/* Content Body */}
        <View style={styles.body}>
          {!targetUrl ? (
            <View style={styles.errorContainer}>
              <Icon name="alert-circle-outline" size={48} color="#EF4444" />
              <Text style={styles.errorText}>Document URL is unavailable.</Text>
            </View>
          ) : isImage ? (
            <View style={styles.imageContainer}>
              <ScrollView
                style={styles.imageScroll}
                contentContainerStyle={styles.imageScrollContent}
                minimumZoomScale={1}
                maximumZoomScale={4}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                bouncesZoom={true}
                centerContent={true}
              >
                <Image
                  source={{ uri: targetUrl }}
                  style={styles.imagePreview}
                  resizeMode="contain"
                  onLoadStart={() => setLoading(true)}
                  onLoadEnd={() => setLoading(false)}
                  onError={() => {
                    setLoading(false);
                    setHasError(true);
                  }}
                />
              </ScrollView>
            </View>
          ) : (
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
          )}

          {/* Loading Indicator */}
          {loading && !hasError && (
            <View style={styles.loadingOverlay}>
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
        <MediaPreviewActionsModal
          visible={showActionsModal}
          onClose={() => setShowActionsModal(false)}
          mediaUrl={targetUrl}
          fileName={displayName}
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F12",
  },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1F1F24",
    backgroundColor: "#16161A",
    marginTop: Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0,
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
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
    backgroundColor: "#0F0F12",
    position: "relative",
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
