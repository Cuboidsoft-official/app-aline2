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

export const setCallSpeakerEnabled = async (enabled: boolean) => {
  if (!isSupported || typeof nativeCallAudioModule.setSpeakerEnabled !== "function") {
    return false;
  }

  try {
    return Boolean(await nativeCallAudioModule.setSpeakerEnabled(Boolean(enabled)));
  } catch (error) {
    console.log("call speaker route error", error);
    return false;
  }
};

export const resetCallAudioRoute = async () => {
  if (!isSupported || typeof nativeCallAudioModule.resetAudioRoute !== "function") {
    return false;
  }

  try {
    return Boolean(await nativeCallAudioModule.resetAudioRoute());
  } catch (error) {
    console.log("call audio reset error", error);
    return false;
  }
};
