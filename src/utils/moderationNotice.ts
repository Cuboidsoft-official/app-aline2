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
    nextMessage,
    [
      {
        text: "Choose another file",
        isPreferred: true,
        onPress: () => {
          onChooseAnotherFile?.();
        },
      },
      {
        text: "Got it",
        style: "cancel",
      },
    ],
    { cancelable: true },
  );

  return true;
};
