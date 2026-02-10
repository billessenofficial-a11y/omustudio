import type { ClipProperties, TextAnimation } from '../types/editor';

export interface TextTemplate {
  id: string;
  label: string;
  preview: string;
  duration: number;
  properties: ClipProperties;
}

export const TEXT_TEMPLATES: TextTemplate[] = [
  {
    id: 'title',
    label: 'Title',
    preview: 'BIG TITLE',
    duration: 5,
    properties: {
      text: 'Your Title',
      fontSize: 72,
      fontFamily: "'Inter', sans-serif",
      fontColor: '#ffffff',
      textAlign: 'center',
      opacity: 1,
      textAnimation: 'fadeIn' as TextAnimation,
      animationDuration: 0.6,
    },
  },
  {
    id: 'subtitle',
    label: 'Subtitle',
    preview: 'Subtitle text',
    duration: 4,
    properties: {
      text: 'Your Subtitle',
      fontSize: 36,
      fontFamily: "'Inter', sans-serif",
      fontColor: '#d4d4d8',
      textAlign: 'center',
      opacity: 1,
      textAnimation: 'slideUp' as TextAnimation,
      animationDuration: 0.5,
    },
  },
  {
    id: 'lower-third',
    label: 'Lower Third',
    preview: 'Name | Title',
    duration: 4,
    properties: {
      text: 'Speaker Name',
      fontSize: 32,
      fontFamily: "'Inter', sans-serif",
      fontColor: '#ffffff',
      textAlign: 'left',
      opacity: 1,
      y: 75,
      x: 10,
      textAnimation: 'slideLeft' as TextAnimation,
      animationDuration: 0.4,
    },
  },
  {
    id: 'caption',
    label: 'Caption',
    preview: 'Caption text here...',
    duration: 3,
    properties: {
      text: 'Caption text',
      fontSize: 24,
      fontFamily: "'Inter', sans-serif",
      fontColor: '#fafafa',
      textAlign: 'center',
      opacity: 0.9,
      y: 85,
      textAnimation: 'fadeIn' as TextAnimation,
      animationDuration: 0.3,
    },
  },
  {
    id: 'heading',
    label: 'Heading',
    preview: 'Bold Heading',
    duration: 5,
    properties: {
      text: 'Heading',
      fontSize: 56,
      fontFamily: "'Inter', sans-serif",
      fontColor: '#ffffff',
      textAlign: 'left',
      opacity: 1,
      textAnimation: 'scaleUp' as TextAnimation,
      animationDuration: 0.5,
    },
  },
  {
    id: 'typewriter',
    label: 'Typewriter',
    preview: 'Type it out...',
    duration: 5,
    properties: {
      text: 'Typed text here',
      fontSize: 40,
      fontFamily: "'Fira Code', monospace",
      fontColor: '#22d3ee',
      textAlign: 'center',
      opacity: 1,
      textAnimation: 'typewriter' as TextAnimation,
      animationDuration: 2,
    },
  },
  {
    id: 'pop-text',
    label: 'Pop',
    preview: 'POP!',
    duration: 3,
    properties: {
      text: 'Pop Text',
      fontSize: 64,
      fontFamily: "'Inter', sans-serif",
      fontColor: '#f97316',
      textAlign: 'center',
      opacity: 1,
      textAnimation: 'pop' as TextAnimation,
      animationDuration: 0.4,
    },
  },
  {
    id: 'blur-reveal',
    label: 'Blur Reveal',
    preview: 'Reveal...',
    duration: 4,
    properties: {
      text: 'Revealed Text',
      fontSize: 48,
      fontFamily: "'Inter', sans-serif",
      fontColor: '#ffffff',
      textAlign: 'center',
      opacity: 1,
      textAnimation: 'blurReveal' as TextAnimation,
      animationDuration: 0.8,
    },
  },
];
