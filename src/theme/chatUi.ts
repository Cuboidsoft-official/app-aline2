export type ChatLayoutMetrics = {
  headerAvatar: number;
  headerAction: number;
  titleFontSize: number;
  statusFontSize: number;
  bodyFontSize: number;
  bodyLineHeight: number;
  metaFontSize: number;
  sectionTitleFontSize: number;
  listPadding: number;
  bubblePaddingX: number;
  bubblePaddingY: number;
  bubbleRadius: number;
  bubbleMaxWidth: `${number}%`;
  wideBubbleMaxWidth: `${number}%`;
  minBubbleWidth: number;
  senderAvatar: number;
  senderFontSize: number;
  heroAvatar: number;
  cardPadding: number;
};

export const getChatLayoutMetrics = (width: number): ChatLayoutMetrics => {
  if (width < 360) {
    return {
      headerAvatar: 42,
      headerAction: 34,
      titleFontSize: 16,
      statusFontSize: 12,
      bodyFontSize: 14,
      bodyLineHeight: 20,
      metaFontSize: 11,
      sectionTitleFontSize: 14,
      listPadding: 10,
      bubblePaddingX: 14,
      bubblePaddingY: 11,
      bubbleRadius: 18,
      bubbleMaxWidth: "92%",
      wideBubbleMaxWidth: "98%",
      minBubbleWidth: 104,
      senderAvatar: 30,
      senderFontSize: 12,
      heroAvatar: 80,
      cardPadding: 14,
    };
  }

  if (width > 430) {
    return {
      headerAvatar: 50,
      headerAction: 40,
      titleFontSize: 18,
      statusFontSize: 13,
      bodyFontSize: 16,
      bodyLineHeight: 24,
      metaFontSize: 12,
      sectionTitleFontSize: 16,
      listPadding: 16,
      bubblePaddingX: 17,
      bubblePaddingY: 13,
      bubbleRadius: 22,
      bubbleMaxWidth: "84%",
      wideBubbleMaxWidth: "94%",
      minBubbleWidth: 132,
      senderAvatar: 34,
      senderFontSize: 13,
      heroAvatar: 92,
      cardPadding: 18,
    };
  }

  return {
    headerAvatar: 46,
    headerAction: 38,
    titleFontSize: 17,
    statusFontSize: 12.5,
    bodyFontSize: 15,
    bodyLineHeight: 22,
    metaFontSize: 11.5,
    sectionTitleFontSize: 15,
    listPadding: 12,
    bubblePaddingX: 16,
    bubblePaddingY: 12,
    bubbleRadius: 20,
    bubbleMaxWidth: "88%",
    wideBubbleMaxWidth: "96%",
    minBubbleWidth: 118,
    senderAvatar: 32,
    senderFontSize: 12.5,
    heroAvatar: 86,
    cardPadding: 16,
  };
};
