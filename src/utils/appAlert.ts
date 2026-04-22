import type { KeyboardTypeOptions } from "react-native";

export type AppAlertButtonStyle = "default" | "cancel" | "destructive";

export type AppAlertButton = {
  text?: string;
  onPress?: ((value?: string) => void) | (() => void);
  style?: AppAlertButtonStyle;
  isPreferred?: boolean;
};

export type AppAlertOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
};

export type AppAlertPresentation = "dialog" | "sheet";

export type AppAlertPromptType = "plain-text" | "secure-text" | "login-password";

export type AppAlertConfig = {
  id: number;
  kind: "alert" | "prompt";
  presentation?: AppAlertPresentation;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
  options?: AppAlertOptions;
  promptType?: AppAlertPromptType;
  defaultValue?: string;
  keyboardType?: KeyboardTypeOptions;
};

type AppAlertPresenter = {
  show: (config: AppAlertConfig) => void;
  dismiss: () => void;
};

let presenter: AppAlertPresenter | null = null;
let nextAlertId = 1;
const pendingAlerts: AppAlertConfig[] = [];

const normalizeButtons = (buttons?: AppAlertButton[]) => {
  if (buttons?.length) {
    return buttons;
  }

  return [{ text: "OK" }];
};

const queueAlert = (config: Omit<AppAlertConfig, "id">) => {
  const nextConfig: AppAlertConfig = {
    ...config,
    id: nextAlertId++,
    presentation: config.presentation || "dialog",
    buttons: normalizeButtons(config.buttons),
  };

  if (presenter) {
    presenter.show(nextConfig);
    return;
  }

  pendingAlerts.push(nextConfig);
};

export const registerAppAlertPresenter = (nextPresenter: AppAlertPresenter | null) => {
  presenter = nextPresenter;

  if (presenter) {
    while (pendingAlerts.length > 0) {
      const nextAlert = pendingAlerts.shift();
      if (nextAlert) {
        presenter.show(nextAlert);
      }
    }
  }

  return () => {
    if (presenter === nextPresenter) {
      presenter = null;
    }
  };
};

const alert = (
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
  options?: AppAlertOptions,
) => {
  queueAlert({
    kind: "alert",
    presentation: "dialog",
    title,
    message,
    buttons: normalizeButtons(buttons),
    options,
  });
};

const sheet = (
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
  options?: AppAlertOptions,
) => {
  queueAlert({
    kind: "alert",
    presentation: "sheet",
    title,
    message,
    buttons: normalizeButtons(buttons),
    options,
  });
};

const prompt = (
  title: string,
  message?: string,
  callbackOrButtons?: ((value?: string) => void) | AppAlertButton[],
  type: AppAlertPromptType = "plain-text",
  defaultValue = "",
  keyboardType: KeyboardTypeOptions = "default",
) => {
  const buttons = Array.isArray(callbackOrButtons)
    ? callbackOrButtons
    : [
        { text: "Cancel", style: "cancel" as const },
        { text: "OK", onPress: callbackOrButtons },
      ];

  queueAlert({
    kind: "prompt",
    title,
    message,
    buttons: normalizeButtons(buttons),
    promptType: type,
    defaultValue,
    keyboardType,
  });
};

const dismiss = () => {
  presenter?.dismiss();
};

export const Alert = {
  alert,
  sheet,
  prompt,
  dismiss,
};

export default Alert;
