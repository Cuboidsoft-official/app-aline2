import {
  filterFollowUsersByExpectedIds,
  normalizeFollowUsers,
  normalizeIdList,
} from "../src/screens/FollowersFollowingScreen";

describe("FollowersFollowingScreen relationship guards", () => {
  it("normalizes relationship ids from strings and populated user objects", () => {
    expect(
      normalizeIdList([
        " follower-1 ",
        { _id: "follower-2" },
        { id: "follower-3" },
        { _id: "follower-2" },
        "",
        null,
      ]),
    ).toEqual(["follower-1", "follower-2", "follower-3"]);
  });

  it("dedupes API users and keeps only expected relationship users in expected order", () => {
    const users = normalizeFollowUsers([
      { _id: "user-a", username: "alice" },
      { _id: "user-b", username: "bruno" },
      { _id: "user-a", username: "alice-duplicate" },
      { _id: "unrelated", username: "not-a-relationship" },
    ]);

    expect(filterFollowUsersByExpectedIds(users, ["user-b", "missing", "user-a"])).toEqual([
      { _id: "user-b", username: "bruno", name: undefined, profilePic: undefined, isVerified: undefined },
      { _id: "user-a", username: "alice", name: undefined, profilePic: undefined, isVerified: undefined },
    ]);
  });

  it("leaves API users untouched when a route cannot provide expected ids", () => {
    const users = normalizeFollowUsers([
      { _id: "user-a", username: "alice" },
      { _id: "user-b", username: "bruno" },
    ]);

    expect(filterFollowUsersByExpectedIds(users, null)).toEqual(users);
  });
});
