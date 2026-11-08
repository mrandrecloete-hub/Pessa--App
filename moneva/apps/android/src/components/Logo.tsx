import Svg, { Defs, LinearGradient, Path, Rect, Stop, Circle } from 'react-native-svg';
import { brand } from '@/theme/tokens';

/**
 * MONEVA mark: a rounded shield (stability) holding an "M" whose right stroke rises into a
 * growth arrow (growth) with a gold coin dot (value). Original artwork, vector, scales to any size.
 */
export function Logo({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityRole="image" accessibilityLabel="MONEVA logo">
      <Defs>
        <LinearGradient id="em" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={brand.emeraldBright} />
          <Stop offset="1" stopColor={brand.emerald} />
        </LinearGradient>
      </Defs>
      <Path d="M50 4 L88 18 V50 C88 74 72 90 50 97 C28 90 12 74 12 50 V18 Z" fill={brand.navy} />
      <Path d="M50 4 L88 18 V50 C88 74 72 90 50 97 C28 90 12 74 12 50 V18 Z" fill="none" stroke={brand.gold} strokeWidth={2.2} />
      <Path d="M28 68 V36 L42 52 L56 36 V68" fill="none" stroke="url(#em)" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M56 52 L72 30 M62 30 H72 V40" fill="none" stroke={brand.gold} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={72} cy={68} r={4.2} fill={brand.gold} />
    </Svg>
  );
}

export function LogoTile({ size = 1024 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect width={100} height={100} fill={brand.navy} />
    </Svg>
  );
}
