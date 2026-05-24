import { getReadableApiErrorMessage, isModerationBlockedError } from "../api/networkErrors";
import { Alert } from "./appAlert";

type ModerationSheetOptions = {
  onChooseAnotherFile?: () => void;
  fallbackMessage?: string;
};

export const showModerationBlockedSheet = (
  error: unknown,
  { onChooseAnotherFile, fallbackMessage = "This content could not be shared right now." }: ModerationSheetOptions = {},
) => {
  const nextMessage = getReadableApiErrorMessage(error, fallbackMessage);

  if (!isModerationBlockedError(error)) {
    return false;
  }

  Alert.sheet(
    "Content blocked",
    nextMessage || "Choose another file.",
    [
      {
        text: "Choose another file",
        isPreferred: true,
        onPress: () => {
          onChooseAnotherFile?.();
        },
      },
    ],
    { cancelable: true },
  );

  return true;
};
