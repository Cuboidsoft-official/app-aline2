require("react-native-gesture-handler/jestSetup");

jest.mock("react-native-linear-gradient", () => "LinearGradient");
jest.mock("react-native-vector-icons/Ionicons", () => "Ionicons");
jest.mock(
  "@react-native-async-storage/async-storage",
  () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("react-native-image-picker", () => ({
  launchImageLibrary: jest.fn(async () => ({ assets: [] })),
  launchCamera: jest.fn(async () => ({ assets: [] })),
}));
jest.mock("socket.io-client", () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  })),
}));
