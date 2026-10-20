import type { SVGProps } from 'react';
import type { RatingValue } from '../lib/types';

interface FaceIconProps extends SVGProps<SVGSVGElement> {
  value: RatingValue;
}

const FACES: Record<RatingValue, { fill: string; ink: string; mouth: string }> = {
  good: { fill: '#22c55e', ink: '#14532d', mouth: 'M40 78 Q64 98 88 78' },
  regular: { fill: '#f59e0b', ink: '#78350f', mouth: 'M44 86 L84 86' },
  bad: { fill: '#ef4444', ink: '#7f1d1d', mouth: 'M44 88 Q64 72 84 88' },
};

export default function FaceIcon({ value, ...props }: FaceIconProps) {
  const face = FACES[value];
  return (
    <svg viewBox="0 0 128 128" aria-hidden="true" {...props}>
      <circle cx="64" cy="64" r="60" fill={face.fill} />
      <circle cx="45" cy="54" r="10" fill={face.ink} />
      <circle cx="83" cy="54" r="10" fill={face.ink} />
      <path
        d={face.mouth}
        stroke={face.ink}
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
