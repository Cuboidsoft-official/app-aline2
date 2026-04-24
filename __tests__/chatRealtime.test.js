import { getMessageIdentity } from "../src/utils/chatMessageIdentity";
import {
  getLastIncomingUnseenMessage,
  mergeMessageReaction,
  mergeMessageSeen,
} from "../src/utils/chatRealtime";

describe("chat message identity fallbacks", () => {
  it("resolves the first available message identity", () => {
    expect(getMessageIdentity({ _id: "mongo-id" })).toBe("mongo-id");
    expect(getMessageIdentity({ id: "legacy-id" })).toBe("legacy-id");
    expect(getMessageIdentity({ clientMessageId: "optimistic-id" })).toBe("optimistic-id");
    expect(getMessageIdentity(null)).toBe("");
  });

  it("merges reactions for messages that only expose id", () => {
    const result = mergeMessageReaction(
      [{ id: "legacy-1", reactions: [] }],
      { messageId: "legacy-1", userId: "user-1", emoji: "🔥" },
    );

    expect(result[0].reactions).toEqual([{ emoji: "🔥", users: ["user-1"] }]);
  });

  it("merges seen receipts for messages that only expose id", () => {
    const result = mergeMessageSeen(
      [{ id: "legacy-2", seenBy: [] }],
      { messageId: "legacy-2", userId: "user-2", seenAt: "2026-04-24T00:00:00.000Z" },
    );

    expect(result[0].seenBy).toEqual([
      { userId: "user-2", seenAt: "2026-04-24T00:00:00.000Z" },
    ]);
  });

  it("finds the latest incoming unseen message with id fallback", () => {
    const messages = [
      { id: "m-1", sender: { _id: "self" }, seenBy: [{ userId: "self" }] },
      { id: "m-2", sender: { _id: "other" }, seenBy: [] },
    ];

    expect(getLastIncomingUnseenMessage(messages, "self")).toEqual(messages[1]);
  });
});
