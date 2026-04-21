import { NativeModules, Platform } from "react-native";

export type ArFilterPreset = "none" | "dog";

type ArFilterNativeModule = {
  applyPreset?: (trackId: string, preset: ArFilterPreset) => Promise<boolean>;
  getAvailablePresets?: () => Promise<{ supported?: boolean; presets?: string[] }>;
};

const nativeArFilterModule = NativeModules.ArFilterModule as ArFilterNativeModule | undefined;

export const AR_FILTER_PRESET_ORDER: ArFilterPreset[] = ["none", "dog"];

export const AR_FILTER_LABELS: Record<ArFilterPreset, string> = {
  none: "Filters",
  dog: "Dog AR",
};

export const isArFilterSupported = async (): Promise<boolean> => {
  if (Platform.OS !== "android" || !nativeArFilterModule?.getAvailablePresets) {
    return false;
  }

  try {
    const response = await nativeArFilterModule.getAvailablePresets();
    return Boolean(response?.supported);
  } catch (error) {
    console.log("ar filter capability check error", error);
    return false;
  }
};

export const applyArFilterPresetToTrack = async (
  track: { id?: string; kind?: string } | null | undefined,
  preset: ArFilterPreset,
): Promise<boolean> => {
  if (Platform.OS !== "android" || !nativeArFilterModule?.applyPreset) {
    return false;
  }

  const trackId = String(track?.id || "").trim();
  if (!trackId || String(track?.kind || "") !== "video") {
    return false;
  }

  try {
    return Boolean(await nativeArFilterModule.applyPreset(trackId, preset));
  } catch (error) {
    console.log("ar filter apply error", error);
    return false;
  }
};
