/* eslint-env jest */

require("react-native-gesture-handler/jestSetup");

jest.mock("react-native-linear-gradient", () => "LinearGradient");
jest.mock("react-native-vector-icons/Ionicons", () => "Ionicons");
jest.mock("react-native-nitro-sound", () => {
  const createMockSound = () => ({
    startRecorder: jest.fn(async () => "mock-recording.m4a"),
    pauseRecorder: jest.fn(async () => "Recorder paused"),
    resumeRecorder: jest.fn(async () => "Recorder resumed"),
    stopRecorder: jest.fn(async () => "mock-recording.m4a"),
    startPlayer: jest.fn(async () => "Player started"),
    stopPlayer: jest.fn(async () => "Player stopped"),
    pausePlayer: jest.fn(async () => "Player paused"),
    resumePlayer: jest.fn(async () => "Player resumed"),
    seekToPlayer: jest.fn(async () => "Seek complete"),
    setVolume: jest.fn(async () => "Volume set"),
    setPlaybackSpeed: jest.fn(async () => "Playback speed set"),
    setSubscriptionDuration: jest.fn(),
    addRecordBackListener: jest.fn(),
    removeRecordBackListener: jest.fn(),
    addPlayBackListener: jest.fn(),
    removePlayBackListener: jest.fn(),
    addPlaybackEndListener: jest.fn(),
    removePlaybackEndListener: jest.fn(),
    mmss: jest.fn(() => "00:00"),
    mmssss: jest.fn(() => "00:00:00"),
    dispose: jest.fn(),
  });

  return {
    createSound: jest.fn(createMockSound),
  };
});
jest.mock("@react-native-clipboard/clipboard", () => ({
  getString: jest.fn(async () => ""),
  setString: jest.fn(),
}));
jest.mock("react-native-snackbar", () => ({
  Snackbar: {
    show: jest.fn(),
    dismiss: jest.fn(),
  },
  show: jest.fn(),
  dismiss: jest.fn(),
}));
jest.mock(
  "@react-native-async-storage/async-storage",
  () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("react-native-keychain", () => ({
  ACCESSIBLE: {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
  },
  getGenericPassword: jest.fn(async () => null),
  setGenericPassword: jest.fn(async () => true),
  resetGenericPassword: jest.fn(async () => true),
}));
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
jest.mock("react-native-webrtc", () => {
  class MockMediaStream {
    constructor() {
      this._tracks = [];
    }

    getTracks() {
      return this._tracks;
    }

    getAudioTracks() {
      return this._tracks.filter((track) => track.kind === "audio");
    }

    getVideoTracks() {
      return this._tracks.filter((track) => track.kind === "video");
    }

    addTrack(track) {
      this._tracks.push(track);
    }

    toURL() {
      return "mock-stream-url";
    }
  }

  class MockRTCPeerConnection {
    constructor() {
      this.connectionState = "new";
      this.localDescription = null;
      this.remoteDescription = null;
    }

    addTrack = jest.fn();
    addIceCandidate = jest.fn(async () => {});
    createOffer = jest.fn(async () => ({ type: "offer", sdp: "mock-offer" }));
    createAnswer = jest.fn(async () => ({ type: "answer", sdp: "mock-answer" }));
    setLocalDescription = jest.fn(async (value) => {
      this.localDescription = value;
    });
    setRemoteDescription = jest.fn(async (value) => {
      this.remoteDescription = value;
    });
    addEventListener = jest.fn();
    close = jest.fn();
  }

  return {
    MediaStream: MockMediaStream,
    RTCIceCandidate: jest.fn((value) => value),
    RTCPeerConnection: MockRTCPeerConnection,
    RTCSessionDescription: jest.fn((value) => value),
    RTCView: "RTCView",
    mediaDevices: {
      getUserMedia: jest.fn(async () => new MockMediaStream()),
    },
  };
});
