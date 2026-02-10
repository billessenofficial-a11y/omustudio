import type { TransitionType } from '../types/editor';
import { interpolate, Easing } from './animation-engine';

export interface TransitionOverlay {
  background: string;
  opacity: number;
  mixBlendMode: string;
}

export interface TransitionStyle {
  opacity: number;
  transform: string;
  clipPath?: string;
  filter?: string;
}

export interface TransitionPair {
  outgoing: TransitionStyle;
  incoming: TransitionStyle;
  overlay?: TransitionOverlay;
}

const IDENTITY: TransitionStyle = { opacity: 1, transform: 'none' };

export function computeTransitionPair(
  transition: TransitionType,
  progress: number
): TransitionPair {
  const p = Math.max(0, Math.min(1, progress));

  switch (transition) {
    case 'none':
      return { outgoing: { ...IDENTITY }, incoming: { ...IDENTITY } };

    case 'crossfade':
      return {
        outgoing: { opacity: 1 - Easing.cubic(p), transform: 'none' },
        incoming: { opacity: Easing.cubic(p), transform: 'none' },
      };

    case 'dipToBlack':
      return {
        outgoing: { opacity: p < 0.5 ? 1 - Easing.cubic(p * 2) : 0, transform: 'none' },
        incoming: { opacity: p < 0.5 ? 0 : Easing.cubic((p - 0.5) * 2), transform: 'none' },
      };

    case 'slideLeft': {
      const outX = interpolate(p, [0, 1], [0, -100]);
      const inX = interpolate(p, [0, 1], [100, 0]);
      return {
        outgoing: { opacity: 1, transform: `translateX(${outX}%)` },
        incoming: { opacity: 1, transform: `translateX(${inX}%)` },
      };
    }

    case 'slideRight': {
      const outX = interpolate(p, [0, 1], [0, 100]);
      const inX = interpolate(p, [0, 1], [-100, 0]);
      return {
        outgoing: { opacity: 1, transform: `translateX(${outX}%)` },
        incoming: { opacity: 1, transform: `translateX(${inX}%)` },
      };
    }

    case 'slideUp': {
      const outY = interpolate(p, [0, 1], [0, -100]);
      const inY = interpolate(p, [0, 1], [100, 0]);
      return {
        outgoing: { opacity: 1, transform: `translateY(${outY}%)` },
        incoming: { opacity: 1, transform: `translateY(${inY}%)` },
      };
    }

    case 'slideDown': {
      const outY = interpolate(p, [0, 1], [0, 100]);
      const inY = interpolate(p, [0, 1], [-100, 0]);
      return {
        outgoing: { opacity: 1, transform: `translateY(${outY}%)` },
        incoming: { opacity: 1, transform: `translateY(${inY}%)` },
      };
    }

    case 'wipeLeft': {
      const pct = interpolate(p, [0, 1], [0, 100]);
      return {
        outgoing: { ...IDENTITY },
        incoming: { opacity: 1, transform: 'none', clipPath: `inset(0 ${100 - pct}% 0 0)` },
      };
    }

    case 'wipeRight': {
      const pct = interpolate(p, [0, 1], [0, 100]);
      return {
        outgoing: { ...IDENTITY },
        incoming: { opacity: 1, transform: 'none', clipPath: `inset(0 0 0 ${100 - pct}%)` },
      };
    }

    case 'zoom': {
      const scale = interpolate(p, [0, 1], [0.3, 1]);
      return {
        outgoing: { opacity: 1 - Easing.cubic(p), transform: 'none' },
        incoming: { opacity: Easing.cubic(p), transform: `scale(${scale})` },
      };
    }

    case 'glare': {
      const ep = Easing.cubic(p);
      const outBrightness = p < 0.5
        ? interpolate(p, [0, 0.5], [1, 4])
        : interpolate(p, [0.5, 1], [4, 1]);
      const outOpacity = p < 0.45 ? 1 : interpolate(p, [0.45, 0.7], [1, 0]);
      const inOpacity = p < 0.3 ? 0 : interpolate(p, [0.3, 0.55], [0, 1]);
      const inBrightness = p < 0.5
        ? interpolate(p, [0.3, 0.5], [4, 1])
        : 1;
      const outScale = interpolate(ep, [0, 1], [1, 1.03]);
      const inScale = interpolate(ep, [0, 1], [1.03, 1]);
      const outSat = p < 0.5
        ? interpolate(p, [0, 0.5], [1, 0.4])
        : interpolate(p, [0.5, 1], [0.4, 1]);
      const inSat = interpolate(Math.max(0.3, Math.min(0.8, p)), [0.3, 0.8], [0.4, 1]);
      return {
        outgoing: {
          opacity: Math.max(0, Math.min(1, outOpacity)),
          transform: `scale(${outScale})`,
          filter: `brightness(${outBrightness}) saturate(${outSat})`,
        },
        incoming: {
          opacity: Math.max(0, Math.min(1, inOpacity)),
          transform: `scale(${inScale})`,
          filter: `brightness(${Math.max(1, inBrightness)}) saturate(${inSat})`,
        },
      };
    }

    case 'filmBurn': {
      const outOpacity = p < 0.4 ? 1 : interpolate(p, [0.4, 0.65], [1, 0]);
      const inOpacity = p < 0.35 ? 0 : interpolate(p, [0.35, 0.6], [0, 1]);
      const burnIntensity = p < 0.5
        ? interpolate(p, [0, 0.5], [0, 1])
        : interpolate(p, [0.5, 1], [1, 0]);
      const outScale = 1 + burnIntensity * 0.015;
      const inScale = 1 + (1 - Easing.cubic(p)) * 0.015;
      const filmSepia = burnIntensity * 0.35;
      const filmBrightness = 1 + burnIntensity * 0.8;

      const streakX = interpolate(p, [0, 1], [-20, 120]);
      const streak2X = interpolate(p, [0, 1], [-30, 110]);
      const streakOpacity = burnIntensity;

      const overlay: TransitionOverlay = {
        opacity: streakOpacity,
        mixBlendMode: 'screen',
        background: [
          `radial-gradient(ellipse 35% 100% at ${streakX}% 50%, rgba(255,140,20,0.95) 0%, rgba(255,80,10,0.6) 30%, transparent 70%)`,
          `radial-gradient(ellipse 25% 120% at ${streak2X}% 45%, rgba(255,50,90,0.7) 0%, rgba(200,30,80,0.3) 35%, transparent 65%)`,
          `radial-gradient(ellipse 45% 80% at ${streakX + 15}% 55%, rgba(255,200,50,0.5) 0%, transparent 60%)`,
          `radial-gradient(ellipse 20% 150% at ${streak2X + 10}% 50%, rgba(255,180,120,0.4) 0%, transparent 50%)`,
          `linear-gradient(90deg, rgba(255,100,0,${burnIntensity * 0.3}) 0%, transparent 30%, transparent 70%, rgba(180,30,60,${burnIntensity * 0.2}) 100%)`,
        ].join(', '),
      };

      return {
        outgoing: {
          opacity: Math.max(0, Math.min(1, outOpacity)),
          transform: `scale(${outScale})`,
          filter: `sepia(${filmSepia}) brightness(${filmBrightness}) saturate(${1 + burnIntensity * 0.5})`,
        },
        incoming: {
          opacity: Math.max(0, Math.min(1, inOpacity)),
          transform: `scale(${inScale})`,
          filter: `sepia(${filmSepia * 0.6}) brightness(${1 + burnIntensity * 0.4}) saturate(${1 + burnIntensity * 0.3})`,
        },
        overlay,
      };
    }

    default:
      return { outgoing: { ...IDENTITY }, incoming: { ...IDENTITY } };
  }
}

export function computeTransitionIn(
  transition: TransitionType,
  progress: number
): TransitionStyle {
  return computeTransitionPair(transition, progress).incoming;
}

export function getTransitionProgress(
  currentTime: number,
  clipStartTime: number,
  transitionDuration: number
): number {
  const elapsed = currentTime - clipStartTime;
  if (transitionDuration <= 0) return 1;
  return Math.max(0, Math.min(1, elapsed / transitionDuration));
}

export const TRANSITION_OPTIONS: { value: TransitionType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'crossfade', label: 'Crossfade' },
  { value: 'dipToBlack', label: 'Dip to Black' },
  { value: 'slideLeft', label: 'Slide Left' },
  { value: 'slideRight', label: 'Slide Right' },
  { value: 'slideUp', label: 'Slide Up' },
  { value: 'slideDown', label: 'Slide Down' },
  { value: 'wipeLeft', label: 'Wipe Left' },
  { value: 'wipeRight', label: 'Wipe Right' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'glare', label: 'Glare' },
  { value: 'filmBurn', label: 'Film Burn' },
];
