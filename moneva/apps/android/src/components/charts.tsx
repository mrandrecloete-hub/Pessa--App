import Svg, { Circle, Defs, G, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { View } from 'react-native';

/** Area sparkline of balances (numbers only for drawing; the values come from decimal strings). */
export function Sparkline({
  values,
  width = 160,
  height = 60,
  color,
  fill,
}: {
  values: number[];
  width?: number;
  height?: number;
  color: string;
  fill: string;
}) {
  if (values.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...values),
    max = Math.max(...values),
    span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 4 - ((v - min) / span) * (height - 10)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <Svg width={width} height={height} accessibilityLabel="Balance trend this month">
      <Defs>
        <LinearGradient id="sf" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={fill} stopOpacity={0.45} />
          <Stop offset="1" stopColor={fill} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={`${line} L${width} ${height} L0 ${height} Z`} fill="url(#sf)" />
      <Path d={line} stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Ring({
  percent,
  size = 92,
  stroke = 10,
  color,
  track,
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color: string;
  track: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2,
    circ = 2 * Math.PI * r,
    p = Math.max(0, Math.min(100, percent));
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p) }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(circ * p) / 100} ${circ}`}
        />
      </Svg>
      {children}
    </View>
  );
}

export interface Slice {
  key: string;
  value: number;
  color: string;
}
export function Donut({ slices, size = 110, stroke = 20, track }: { slices: Slice[]; size?: number; stroke?: number; track: string }) {
  const r = (size - stroke) / 2,
    circ = 2 * Math.PI * r,
    total = slices.reduce((a, s) => a + s.value, 0);
  let offset = 0;
  return (
    <Svg width={size} height={size} accessibilityLabel="Spending breakdown chart">
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      {total > 0 &&
        slices.map((s) => {
          const len = (s.value / total) * circ;
          const el = (
            <Circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={s.color}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${Math.max(len - 2, 0)} ${circ}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += len;
          return el;
        })}
    </Svg>
  );
}

export function Bars({
  data,
  width,
  height = 120,
  a,
  b,
  label,
}: {
  data: Array<{ label: string; a: number; b: number }>;
  width: number;
  height?: number;
  a: string;
  b: string;
  label: string;
}) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b])),
    gap = width / data.length,
    bw = gap * 0.26;
  return (
    <Svg width={width} height={height + 26} accessibilityLabel={label}>
      {data.map((d, i) => (
        <G key={d.label}>
          {d.a > 0 && (
            <Path
              d={`M${i * gap + gap * 0.3} ${height} v${-Math.max(2, (d.a / max) * height)}`}
              stroke={a}
              strokeWidth={bw}
              strokeLinecap="round"
            />
          )}
          {d.b > 0 && (
            <Path
              d={`M${i * gap + gap * 0.7} ${height} v${-Math.max(2, (d.b / max) * height)}`}
              stroke={b}
              strokeWidth={bw}
              strokeLinecap="round"
            />
          )}
          <SvgText x={i * gap + gap * 0.5} y={height + 16} fontSize={10} fontFamily="sans-serif" fill="#8FB0A6" textAnchor="middle">
            {d.label}
          </SvgText>
        </G>
      ))}
    </Svg>
  );
}
