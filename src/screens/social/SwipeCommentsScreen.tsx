import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import SwipeCommentsSheet from "../../features/social/components/SwipeCommentsSheet";
import { socialApi } from "../../features/social/socialApi";
import { Swipe } from "../../features/social/types";
import { toUserSafeMessage } from "../../features/social/validation";

function SwipeCommentsScreen({ route, navigation }: any) {
  const swipeId =
    typeof route?.params?.swipeId === "string"
      ? route.params.swipeId
      : typeof route?.params?.reelId === "string"
        ? route.params.reelId
        : "";

  const [swipe, setSwipe] = useState<Swipe | null>(null);

  const load = useCallback(async () => {
    if (!swipeId) {
      throw new Error("Invalid swipe id");
    }

    const swipes = await socialApi.getSwipes();
    setSwipe(swipes.find((item) => item.id === swipeId) || null);
  }, [swipeId]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        await load();
      } catch (error) {
        if (active) {
          Alert.alert("Could not load comments", toUserSafeMessage(error));
          navigation.goBack();
        }
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [load, navigation]);

  return (
    <View style={styles.container}>
      <SwipeCommentsSheet
        visible
        swipe={swipe}
        onClose={() => navigation.goBack()}
        onSwipeUpdate={setSwipe}
        onOpenFull={() => {}}
        showOpenFull={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
});

export default SwipeCommentsScreen;
