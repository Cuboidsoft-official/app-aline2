declare module 'react-native-view-shot' {
  import React from 'react';
  import { ViewProps } from 'react-native';

  export interface ViewShotProps extends ViewProps {
    options?: {
      format?: 'png' | 'jpg' | 'webm' | 'raw';
      quality?: number;
      result?: 'tmpfile' | 'base64' | 'data-uri' | 'zip-base64';
      snapshotContentContainer?: boolean;
    };
    captureMode?: 'mount' | 'continuous' | 'update';
    onCapture?: (uri: string) => void;
    onCaptureFailure?: (error: Error) => void;
    children?: React.ReactNode;
  }

  export class ViewShot extends React.Component<ViewShotProps> {
    capture?: () => Promise<string>;
  }

  export function captureRef<T>(
    handle: React.RefObject<T> | T | number,
    options?: ViewShotProps['options']
  ): Promise<string>;

  export function captureScreen(options?: ViewShotProps['options']): Promise<string>;

  export default ViewShot;
}
