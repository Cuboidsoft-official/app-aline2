import type { ViewStyle } from "react-native";

import type { FramedMediaLayout } from "../../screens/composerConfig";

export type FramedMediaStyles = {
  /** Absolutely positioned, clipped frame inside the media container. */
  frame: ViewStyle;
  /** Media box inside the frame, or null to let the media cover the frame. */
  content: ViewStyle | null;
};

export const toFramedMediaStyles = (layout: FramedMediaLayout): FramedMediaStyles => ({
  frame: {
    position: "absolute",
    overflow: "hidden",
    left: layout.frame.left,
    top: layout.frame.top,
    width: layout.frame.width,
    height: layout.frame.height,
  },
  content: layout.content
    ? {
      position: "absolute",
      left: layout.content.left,
      top: layout.content.top,
      width: layout.content.width,
      height: layout.content.height,
      transform: [
        { translateX: layout.content.translateX },
        { translateY: layout.content.translateY },
        { scale: layout.content.scale },
      ],
    }
    : null,
});
