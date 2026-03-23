import React from "react";
import { StyleSheet, View } from "react-native";

import StoryActivitySheet from "../../features/social/components/StoryActivitySheet";

function StoryInsightsScreen({ route, navigation }: any) {
  const storyId = typeof route?.params?.storyId === "string" ? route.params.storyId : "";

  return (
    <View style={styles.container}>
      <StoryActivitySheet
        visible
        storyId={storyId}
        initialTab="views"
        onClose={() => navigation.goBack()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
});

export default StoryInsightsScreen;
