type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

describe("resolveCameraCaptureMediaType", () => {
  const loadPermissionsModule = (platform: "android" | "ios") => {
    jest.resetModules();

    const alertMock = {
      alert: jest.fn(),
      sheet: jest.fn(),
    };

    jest.doMock("react-native", () => ({
      PermissionsAndroid: {
        PERMISSIONS: {
          CAMERA: "android.permission.CAMERA",
          RECORD_AUDIO: "android.permission.RECORD_AUDIO",
        },
        RESULTS: {
          GRANTED: "granted",
        },
        check: jest.fn(async () => true),
        request: jest.fn(async () => "granted"),
      },
      Platform: {
        OS: platform,
      },
    }));

    jest.doMock("../src/utils/appAlert", () => ({
      Alert: alertMock,
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const permissions = require("../src/utils/permissions");
    return {
      permissions,
      alertMock,
    };
  };

  it("returns the provided media type when it is not mixed", async () => {
    const { permissions, alertMock } = loadPermissionsModule("android");

    await expect(permissions.resolveCameraCaptureMediaType("photo")).resolves.toBe("photo");
    expect(alertMock.sheet).not.toHaveBeenCalled();
  });

  it("returns mixed directly on iOS without showing a chooser", async () => {
    const { permissions, alertMock } = loadPermissionsModule("ios");

    await expect(permissions.resolveCameraCaptureMediaType("mixed")).resolves.toBe("mixed");
    expect(alertMock.sheet).not.toHaveBeenCalled();
  });

  it("shows photo/video/cancel options for mixed media on Android", async () => {
    const { permissions, alertMock } = loadPermissionsModule("android");

    const pending = permissions.resolveCameraCaptureMediaType("mixed", {
      title: "Send from camera",
      message: "Choose whether you want to capture a photo or record a video for this chat.",
    });

    expect(alertMock.sheet).toHaveBeenCalledTimes(1);
    const args = alertMock.sheet.mock.calls[0];
    const buttons = args[2] as AlertButton[];

    expect(args[0]).toBe("Send from camera");
    expect(args[1]).toContain("capture a photo");
    expect(buttons.map((button) => button.text)).toEqual(["Photo", "Video", "Cancel"]);

    buttons[1]?.onPress?.();
    await expect(pending).resolves.toBe("video");
  });

  it("resolves to null when cancel is pressed", async () => {
    const { permissions, alertMock } = loadPermissionsModule("android");

    const pending = permissions.resolveCameraCaptureMediaType("mixed");
    const buttons = alertMock.sheet.mock.calls[0][2] as AlertButton[];

    buttons[2]?.onPress?.();
    await expect(pending).resolves.toBeNull();
  });

  it("resolves to null when the chooser is dismissed", async () => {
    const { permissions, alertMock } = loadPermissionsModule("android");

    const pending = permissions.resolveCameraCaptureMediaType("mixed");
    const options = alertMock.sheet.mock.calls[0][3] as { onDismiss?: () => void };

    options.onDismiss?.();
    await expect(pending).resolves.toBeNull();
  });
});
