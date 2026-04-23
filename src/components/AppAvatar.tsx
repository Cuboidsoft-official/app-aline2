import React, { useEffect, useMemo, useState } from "react";
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { normalizeMediaUrl } from "../utils/mediaUrls";

type AppAvatarProps = {
  uri?: string | null;
  name?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  textColor?: string;
};

const getAvatarInitial = (value?: string | null) => {
  const normalized = String(value || "").trim();
  return (normalized.charAt(0) || "A").toUpperCase();
};

function AppAvatar({
  uri,
  name,
  size = 40,
  style,
  backgroundColor = "#1E293B",
  textColor = "#E2E8F0",
}: AppAvatarProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const normalizedUri = useMemo(() => normalizeMediaUrl(String(uri || "").trim()), [uri]);
  const defaultAvatarUri = useMemo(() => normalizeMediaUrl(DEFAULT_AVATAR_URL), []);
  const shouldShowImage = Boolean(normalizedUri) && normalizedUri !== defaultAvatarUri && !loadFailed;
  const avatarInitial = getAvatarInitial(name);

  useEffect(() => {
    setLoadFailed(false);
  }, [normalizedUri]);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
        },
        style,
      ]}
    >
      {shouldShowImage ? (
        <Image
          source={{ uri: normalizedUri }}
          style={[styles.image, { borderRadius: size / 2 }]}
          onError={() => setLoadFailed(true)}
        />
      ) : (
        <Text style={[styles.initial, { color: textColor, fontSize: Math.max(14, Math.round(size * 0.4)) }]}>
          {avatarInitial}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  initial: {
    fontWeight: "800",
  },
});

export default AppAvatar;
