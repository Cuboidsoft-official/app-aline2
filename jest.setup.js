/* eslint-env jest */

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
jest.mock("@react-native-documents/picker", () => ({
  errorCodes: {
    OPERATION_CANCELED: "OPERATION_CANCELED",
    IN_PROGRESS: "IN_PROGRESS",
    NULL_PRESENTER: "NULL_PRESENTER",
    UNABLE_TO_OPEN_FILE_TYPE: "UNABLE_TO_OPEN_FILE_TYPE",
  },
  isErrorWithCode: jest.fn(() => false),
  keepLocalCopy: jest.fn(async () => [{ status: "success", localUri: "/tmp/mock-document.pdf" }]),
  pick: jest.fn(async () => []),
  types: {
    allFiles: "*/*",
    images: "image/*",
    pdf: "application/pdf",
  },
}));
jest.mock("socket.io-client", () => ({
  io: jest.fn(() => ({
    auth: {},
    connected: false,
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  })),
}));
