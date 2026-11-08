import { Image } from 'react-native';
import logo from '../../assets/images/logo.png';

/** The MONEVA mark (artwork supplied by the owner, assets/images/logo.png). */
export function Logo({ size = 96, radius = 14 }: { size?: number; radius?: number }) {
  return <Image source={logo} accessibilityLabel="MONEVA logo" style={{ width: size, height: size, borderRadius: radius }} />;
}
