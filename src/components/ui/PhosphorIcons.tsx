import React from 'react';

/**
 * Inline Phosphor icons (regular weight, viewBox 256, fill-based).
 * Path data from @phosphor-icons/core v2.1.1 (MIT).
 * Inlined instead of adding the icon package for two glyphs.
 */

interface PhosphorIconProps {
  /** Rendered width/height in px */
  size: number;
  /** Fill color (CSS color value) */
  color: string;
  style?: React.CSSProperties;
}

/** Phosphor "contactless-payment" (U+ED42): NFC / wristband scan affordance */
export const ContactlessPaymentIcon: React.FC<PhosphorIconProps> = ({ size, color, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 256 256"
    fill={color}
    aria-hidden="true"
    style={style}
  >
    <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216ZM97.07,100.26a59.33,59.33,0,0,1,0,55.48,8,8,0,1,1-14.14-7.48,42.79,42.79,0,0,0,0-40.52,8,8,0,0,1,14.14-7.48Zm56-32a126.67,126.67,0,0,1,0,119.54A8,8,0,0,1,139,180.23a110.62,110.62,0,0,0,0-104.46,8,8,0,0,1,14.12-7.54Zm-28,16a93,93,0,0,1,0,87.52,8,8,0,1,1-14.12-7.52,77,77,0,0,0,0-72.48,8,8,0,1,1,14.12-7.52Z" />
  </svg>
);

/** Phosphor "house-line" (U+E2C4): home / nach Hause affordance */
export const HouseLineIcon: React.FC<PhosphorIconProps> = ({ size, color, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 256 256"
    fill={color}
    aria-hidden="true"
    style={style}
  >
    <path d="M240,208H224V136l2.34,2.34A8,8,0,0,0,237.66,127L139.31,28.68a16,16,0,0,0-22.62,0L18.34,127a8,8,0,0,0,11.32,11.31L32,136v72H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16ZM48,120l80-80,80,80v88H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48Zm96,88H112V160h32Z" />
  </svg>
);
