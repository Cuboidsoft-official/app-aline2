import React, { useEffect, useState } from "react";
import { Image, StyleSheet } from "react-native";

import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { getStoredUser, subscribeSessionChanges } from "../utils/authSession";
import { normalizeMediaUrl } from "../utils/mediaUrls";

type ProfileTabAvatarProps = {
  color: string;
  focused: boolean;
  size?: number;
};

function ProfileTabAvatar({ color, focused, size = 24 }: ProfileTabAvatarProps) {
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATAR_URL);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;

    const loadUser = async () => {
      try {
        const storedUser = await getStoredUser();
        if (!active) {
          return;
        }

        const nextAvatarUrl = String(
          storedUser?.profilePic || storedUser?.avatarUrl || DEFAULT_AVATAR_URL,
        ).trim();

        setLoadFailed(false);
        setAvatarUrl(nextAvatarUrl || DEFAULT_AVATAR_URL);
      } catch {
        if (active) {
          setLoadFailed(false);
          setAvatarUrl(DEFAULT_AVATAR_URL);
        }
      }
    };

    loadUser();
    const unsubscribe = subscribeSessionChanges(loadUser);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const resolvedAvatarUrl = normalizeMediaUrl(
    !loadFailed && avatarUrl ? avatarUrl : DEFAULT_AVATAR_URL,
  );

  return (
    <Image
      source={{ uri: resolvedAvatarUrl || DEFAULT_AVATAR_URL }}
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: focused ? color : `${color}66`,
        },
      ]}
      onError={() => setLoadFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderWidth: 2,
    backgroundColor: "#fff",
  },
});

export default ProfileTabAvatar;
