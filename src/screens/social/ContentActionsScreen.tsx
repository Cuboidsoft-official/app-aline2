import React from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ContentActionSheet from "../../features/social/components/ContentActionSheet";
import { ContentKind } from "../../features/social/types";

function ContentActionsScreen({ route, navigation }: any) {
  const contentType = route?.params?.contentType as ContentKind;
  const contentId = route?.params?.contentId as string;
  const userId = route?.params?.userId as string | undefined;
  const userLabel = route?.params?.userLabel as string | undefined;
  const title = route?.params?.title as string | undefined;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: "transparent" }]}>
      <ContentActionSheet
        visible
        contentType={contentType}
        contentId={contentId}
        userId={userId}
        userLabel={userLabel}
        title={title}
        onClose={() => navigation.goBack()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
});

export default ContentActionsScreen;
