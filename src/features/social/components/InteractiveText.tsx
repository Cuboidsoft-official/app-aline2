import React, { useMemo } from "react";
import { StyleProp, Text, TextProps, TextStyle } from "react-native";

type InteractiveTextProps = TextProps & {
  text: string;
  prefix?: React.ReactNode;
  mentionStyle?: StyleProp<TextStyle>;
  hashtagStyle?: StyleProp<TextStyle>;
  onPressMention?: (username: string) => void;
  onPressHashtag?: (hashtag: string) => void;
};

type InteractivePart =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; normalizedValue: string }
  | { type: "hashtag"; value: string; normalizedValue: string };

const ENTITY_PATTERN = /[@#][A-Za-z0-9._]+/g;

const buildParts = (text: string): InteractivePart[] => {
  const normalizedText = String(text || "");
  if (!normalizedText) {
    return [];
  }

  const parts: InteractivePart[] = [];
  let lastIndex = 0;
  const matcher = new RegExp(ENTITY_PATTERN);

  for (let match = matcher.exec(normalizedText); match; match = matcher.exec(normalizedText)) {
    const value = match[0] || "";
    const index = typeof match.index === "number" ? match.index : -1;
    if (!value || index < 0) {
      continue;
    }

    if (index > lastIndex) {
      parts.push({ type: "text", value: normalizedText.slice(lastIndex, index) });
    }

    parts.push({
      type: value.startsWith("@") ? "mention" : "hashtag",
      value,
      normalizedValue: value.slice(1),
    });
    lastIndex = index + value.length;
  }

  if (lastIndex < normalizedText.length) {
    parts.push({ type: "text", value: normalizedText.slice(lastIndex) });
  }

  return parts;
};

export default function InteractiveText({
  text,
  prefix,
  mentionStyle,
  hashtagStyle,
  onPressMention,
  onPressHashtag,
  children,
  ...textProps
}: InteractiveTextProps) {
  const parts = useMemo(() => buildParts(text), [text]);

  return (
    <Text {...textProps}>
      {prefix}
      {parts.map((part, index) => {
        if (part.type === "mention") {
          return (
            <Text
              key={`mention-${part.normalizedValue}-${index}`}
              style={mentionStyle}
              suppressHighlighting
              onPress={onPressMention ? () => onPressMention(part.normalizedValue) : undefined}
            >
              {part.value}
            </Text>
          );
        }

        if (part.type === "hashtag") {
          return (
            <Text
              key={`hashtag-${part.normalizedValue}-${index}`}
              style={hashtagStyle}
              suppressHighlighting
              onPress={onPressHashtag ? () => onPressHashtag(part.normalizedValue) : undefined}
            >
              {part.value}
            </Text>
          );
        }

        return <Text key={`text-${index}`}>{part.value}</Text>;
      })}
      {children}
    </Text>
  );
}
