type ExtrapolationType = 'clamp' | 'extend' | 'identity';

interface InterpolateOptions {
  extrapolateLeft?: ExtrapolationType;
  extrapolateRight?: ExtrapolationType;
  easing?: (t: number) => number;
}

export function interpolate(
  value: number,
  inputRange: [number, number],
  outputRange: [number, number],
  options?: InterpolateOptions
): number {
  const [inMin, inMax] = inputRange;
  const [outMin, outMax] = outputRange;
  const extraLeft = options?.extrapolateLeft ?? 'extend';
  const extraRight = options?.extrapolateRight ?? 'extend';
  const easing = options?.easing;

  let t = (value - inMin) / (inMax - inMin);

  if (t < 0) {
    if (extraLeft === 'clamp') t = 0;
    else if (extraLeft === 'identity') return value;
  }
  if (t > 1) {
    if (extraRight === 'clamp') t = 1;
    else if (extraRight === 'identity') return value;
  }

  if (easing) t = easing(Math.max(0, Math.min(1, t)));

  return outMin + t * (outMax - outMin);
}

interface SpringConfig {
  damping?: number;
  stiffness?: number;
  mass?: number;
}

interface SpringParams {
  frame: number;
  fps: number;
  config?: SpringConfig;
}

export function spring({ frame, fps, config }: SpringParams): number {
  const damping = config?.damping ?? 10;
  const stiffness = config?.stiffness ?? 100;
  const mass = config?.mass ?? 1;

  const stepSize = 1 / fps;
  let position = 0;
  let velocity = 0;

  for (let i = 0; i < frame; i++) {
    const springForce = -stiffness * (position - 1);
    const dampingForce = -damping * velocity;
    const acceleration = (springForce + dampingForce) / mass;

    velocity += acceleration * stepSize;
    position += velocity * stepSize;
  }

  return Math.max(0, Math.min(1, position));
}

function cubicBezier(t: number): number {
  return t * t * (3 - 2 * t);
}

export const Easing = {
  cubic: cubicBezier,
  in: (fn: (t: number) => number) => (t: number) => fn(t),
  out: (fn: (t: number) => number) => (t: number) => 1 - fn(1 - t),
  inOut: (fn: (t: number) => number) => (t: number) =>
    t < 0.5 ? fn(t * 2) / 2 : 1 - fn((1 - t) * 2) / 2,
};
