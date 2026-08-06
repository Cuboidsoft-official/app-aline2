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
      headerAvatar: 40,
      headerAction: 32,
      titleFontSize: 15,
      statusFontSize: 11.5,
      bodyFontSize: 13,
      bodyLineHeight: 17,
      metaFontSize: 10,
      sectionTitleFontSize: 14,
      listPadding: 10,
      bubblePaddingX: 11,
      bubblePaddingY: 7,
      bubbleRadius: 15,
      bubbleMaxWidth: "82%",
      wideBubbleMaxWidth: "98%",
      minBubbleWidth: 104,
      senderAvatar: 28,
      senderFontSize: 11.5,
      heroAvatar: 80,
      cardPadding: 14,
    };
  }

  if (width > 430) {
    return {
      headerAvatar: 48,
      headerAction: 38,
      titleFontSize: 17,
      statusFontSize: 12.5,
      bodyFontSize: 14,
      bodyLineHeight: 19,
      metaFontSize: 11,
      sectionTitleFontSize: 16,
      listPadding: 16,
      bubblePaddingX: 14,
      bubblePaddingY: 9,
      bubbleRadius: 17,
      bubbleMaxWidth: "74%",
      wideBubbleMaxWidth: "94%",
      minBubbleWidth: 132,
      senderAvatar: 34,
      senderFontSize: 13,
      heroAvatar: 92,
      cardPadding: 18,
    };
  }

  return {
    headerAvatar: 44,
    headerAction: 36,
    titleFontSize: 16,
    statusFontSize: 12,
    bodyFontSize: 13.5,
    bodyLineHeight: 18,
    metaFontSize: 10.5,
    sectionTitleFontSize: 15,
    listPadding: 12,
    bubblePaddingX: 13,
    bubblePaddingY: 8,
    bubbleRadius: 16,
    bubbleMaxWidth: "78%",
    wideBubbleMaxWidth: "96%",
    minBubbleWidth: 118,
    senderAvatar: 32,
    senderFontSize: 12.5,
    heroAvatar: 86,
    cardPadding: 16,
  };
};
