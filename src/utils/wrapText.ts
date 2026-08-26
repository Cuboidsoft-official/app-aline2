export const wrapTextAt32Chars = (
  text: string,
  maxChars = 32
): string => {
  if (!text) return "";

  const chars = Array.from(text);

  if (chars.length <= maxChars) {
    return text;
  }

  const lines: string[] = [];

  for (let i = 0; i < chars.length; i += maxChars) {
    lines.push(chars.slice(i, i + maxChars).join(""));
  }

  return lines.join("\n");
};
