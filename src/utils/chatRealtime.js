export const mergeMessageSeen = (messages, payload) => {
  const messageId = String(payload?.messageId || "");
  const userId = String(payload?.userId || "");

  if (!messageId || !userId) {
    return messages;
  }

  return messages.map((message) => {
    if (String(message?._id || "") !== messageId) {
      return message;
    }

    const seenBy = Array.isArray(message?.seenBy) ? [...message.seenBy] : [];
    const alreadySeen = seenBy.some((entry) => String(entry?.userId || "") === userId);

    if (alreadySeen) {
      return message;
    }

    return {
      ...message,
      seenBy: [
        ...seenBy,
        {
          userId,
          seenAt: payload?.seenAt || new Date().toISOString(),
        },
      ],
    };
  });
};

export const mergeMessageReaction = (messages, payload) => {
  const messageId = String(payload?.messageId || "");
  const userId = String(payload?.userId || "");
  const emoji = String(payload?.emoji || "");

  if (!messageId || !userId || !emoji) {
    return messages;
  }

  return messages.map((message) => {
    if (String(message?._id || "") !== messageId) {
      return message;
    }

    const reactions = Array.isArray(message?.reactions) ? [...message.reactions] : [];
    const existingIndex = reactions.findIndex((reaction) => String(reaction?.emoji || "") === emoji);

    if (existingIndex === -1) {
      return {
        ...message,
        reactions: [
          ...reactions,
          {
            emoji,
            users: [userId],
          },
        ],
      };
    }

    const targetReaction = reactions[existingIndex] || {};
    const users = Array.isArray(targetReaction.users) ? [...targetReaction.users] : [];

    if (!users.includes(userId)) {
      users.push(userId);
    }

    reactions[existingIndex] = {
      ...targetReaction,
      emoji,
      users,
    };

    return {
      ...message,
      reactions,
    };
  });
};

export const getLastIncomingUnseenMessage = (messages, currentUserId) => {
  const viewerId = String(currentUserId || "");

  if (!viewerId) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const senderId = String(message?.sender?._id || message?.sender || "");

    if (!message?._id || senderId === viewerId) {
      continue;
    }

    const seenBy = Array.isArray(message?.seenBy) ? message.seenBy : [];
    const alreadySeen = seenBy.some((entry) => String(entry?.userId || "") === viewerId);

    if (!alreadySeen) {
      return message;
    }
  }

  return null;
};
