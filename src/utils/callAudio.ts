import { NativeModules, Platform } from "react-native";

const nativeCallAudioModule = NativeModules.CallAudioModule;

const isSupported = Platform.OS === "android" && nativeCallAudioModule;

export const startCallRingtone = async () => {
  if (!isSupported || typeof nativeCallAudioModule.startRingtone !== "function") {
    return false;
  }

  try {
    return Boolean(await nativeCallAudioModule.startRingtone());
  } catch (error) {
    console.log("call ringtone start error", error);
    return false;
  }
};

export const stopCallRingtone = async () => {
  if (!isSupported || typeof nativeCallAudioModule.stopRingtone !== "function") {
    return false;
  }

  try {
    return Boolean(await nativeCallAudioModule.stopRingtone());
  } catch (error) {
    console.log("call ringtone stop error", error);
    return false;
  }
};
