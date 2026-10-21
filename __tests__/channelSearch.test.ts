import { searchPublicChannels } from "../src/features/search/channelSearch";

jest.mock("../src/api/api", () => ({ API: { get: jest.fn() } }));

const { API } = require("../src/api/api");

describe("Channels search backend contract", () => {
  beforeEach(() => (API.get as jest.Mock).mockReset());

  it("calls the mounted /api/search route and returns channels", async () => {
    const channels = [{ _id: "channel-one", groupName: "Aline" }];
    (API.get as jest.Mock).mockResolvedValue({ data: { results: { channels } } });
    await expect(searchPublicChannels("  Ali  ")).resolves.toEqual(channels);
    expect(API.get).toHaveBeenCalledWith("/search", {
      params: { query: "Ali", type: "channels" },
    });
  });

  it("renders an empty result when the backend finds no channels", async () => {
    (API.get as jest.Mock).mockResolvedValue({ data: { results: { channels: [] } } });
    await expect(searchPublicChannels("unknown")).resolves.toEqual([]);
  });

  it("keeps failures visible to the screen's existing error handler", async () => {
    (API.get as jest.Mock).mockRejectedValue(new Error("network unavailable"));
    await expect(searchPublicChannels("Ali")).rejects.toThrow("network unavailable");
  });
});
