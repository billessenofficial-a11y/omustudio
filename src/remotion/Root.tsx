import React from 'react';
import { Composition } from 'remotion';
import { ExportComposition, type ExportCompositionProps } from './ExportComposition';

const calculateMetadata = ({ props }: { props: Record<string, unknown> }) => {
  return {
    width: (props.width as number) || 1920,
    height: (props.height as number) || 1080,
    fps: (props.fps as number) || 30,
    durationInFrames: (props.durationInFrames as number) || 300,
  };
};

export const RemotionRoot: React.FC = () => {
  const defaultProps: ExportCompositionProps = {
    videoClips: [],
    textClips: [],
    transitionOverlays: [],
    overlayClips: [],
    audioClips: [],
  };

  return (
    <Composition
      id="main"
      component={ExportComposition}
      defaultProps={defaultProps}
      calculateMetadata={calculateMetadata}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={300}
    />
  );
};
