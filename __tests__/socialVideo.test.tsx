import React from "react";
import { Animated, PanResponder, StyleSheet, View } from "react-native";
import { act, create } from "react-test-renderer";

import SocialVideo from "../src/features/social/components/SocialVideo";

let mockLatestVideoProps: any = null;
const mockSeek = jest.fn();

jest.mock("react-native-video", () => {
  const ReactLib = require("react");
  const RN = require("react-native");

  return ReactLib.forwardRef((props: any, ref: any) => {
    mockLatestVideoProps = props;
    ReactLib.useImperativeHandle(ref, () => ({
      seek: mockSeek,
    }));
    return ReactLib.createElement(RN.View, { testID: "mock-video" });
  });
});

const flattenStyle = (style: any) => StyleSheet.flatten(style) || {};

const getProgressTrackNode = (root: any) =>
  root.find(
    (node: any) =>
      node.type === View
      && typeof node.props?.onLayout === "function"
      && typeof node.props?.onResponderGrant === "function",
  );

const getProgressFillWidth = (root: any): string | null => {
  const match = root.find(
    (node: any) => {
      if (node.type !== View) {
        return false;
      }
      const flattened = flattenStyle(node.props?.style);
      return (
        flattened.backgroundColor === "#ffffff"
        && flattened.height === 4
        && typeof flattened.width === "string"
      );
    },
  );

  const flattened = flattenStyle(match.props.style);
  return flattened.width || null;
};

describe("SocialVideo swipe controls", () => {
  let animationSpy: jest.SpyInstance;
  let panResponderSpy: jest.SpyInstance;

  beforeAll(() => {
    animationSpy = jest.spyOn(Animated, "timing").mockImplementation(() => ({
      start: (callback?: () => void) => {
        callback?.();
      },
      stop: () => undefined,
      reset: () => undefined,
    }) as any);

    panResponderSpy = jest.spyOn(PanResponder, "create").mockImplementation((config: any) => ({
      panHandlers: {
        onStartShouldSetResponder: config.onStartShouldSetPanResponder,
        onMoveShouldSetResponder: config.onMoveShouldSetPanResponder,
        onResponderGrant: config.onPanResponderGrant,
        onResponderMove: config.onPanResponderMove,
        onResponderRelease: config.onPanResponderRelease,
      },
    }) as any);
  });

  afterAll(() => {
    animationSpy.mockRestore();
    panResponderSpy.mockRestore();
  });

  beforeEach(() => {
    mockLatestVideoProps = null;
    mockSeek.mockReset();
  });

  it("seeks backward and forward from the slider drag position", () => {
    let tree: any;
    act(() => {
      tree = create(
        <SocialVideo
          uri="https://cdn.example.com/swipe/video.mp4"
          paused
          showProgressBar
        />,
      );
    });

    expect(mockLatestVideoProps).toBeTruthy();

    act(() => {
      mockLatestVideoProps.onLoad?.({ duration: 100 });
    });

    const track = getProgressTrackNode(tree.root);

    act(() => {
      track.props.onLayout({ nativeEvent: { layout: { width: 200 } } });
    });

    act(() => {
      track.props.onResponderGrant({ nativeEvent: { locationX: 160 } });
    });

    expect(mockSeek).toHaveBeenLastCalledWith(80);

    act(() => {
      track.props.onResponderMove({ nativeEvent: { locationX: 40 } });
    });

    expect(mockSeek).toHaveBeenLastCalledWith(20);

    act(() => {
      track.props.onResponderRelease({ nativeEvent: { locationX: 120 } });
    });

    expect(mockSeek).toHaveBeenLastCalledWith(60);

    act(() => {
      tree.unmount();
    });
  });

  it("resumes playback from paused progress without resetting to start", () => {
    let tree: any;
    act(() => {
      tree = create(
        <SocialVideo
          uri="https://cdn.example.com/swipe/video.mp4"
          paused
          showProgressBar
        />,
      );
    });

    expect(mockLatestVideoProps).toBeTruthy();

    act(() => {
      mockLatestVideoProps.onLoad?.({ duration: 100 });
      mockLatestVideoProps.onProgress?.({ currentTime: 35, seekableDuration: 100 });
    });

    expect(getProgressFillWidth(tree.root)).toBe("35%");

    act(() => {
      tree.update(
        <SocialVideo
          uri="https://cdn.example.com/swipe/video.mp4"
          paused
          showProgressBar
        />,
      );
    });

    expect(getProgressFillWidth(tree.root)).toBe("35%");

    act(() => {
      tree.update(
        <SocialVideo
          uri="https://cdn.example.com/swipe/video.mp4"
          paused={false}
          showProgressBar
        />,
      );
    });

    expect(getProgressFillWidth(tree.root)).toBe("35%");
    expect(mockSeek).not.toHaveBeenCalled();

    act(() => {
      tree.unmount();
    });
  });
});
