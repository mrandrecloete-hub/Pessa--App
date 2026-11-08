import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { c } = useTheme();
  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.pad, { flex: 1 }]}>{children}</View>
  );
  return (
    <LinearGradient colors={[c.bg, c.bg, c.glow]} locations={[0, 0.6, 1]} style={{ flex: 1 }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {body}
      </SafeAreaView>
    </LinearGradient>
  );
}

export function H1({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <Text accessibilityRole="header" style={[type.title, { color: c.text, marginBottom: space.sm }]}>
      {children}
    </Text>
  );
}
export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const { c } = useTheme();
  return <Text style={[type.body, { color: muted ? c.textMuted : c.text }, style]}>{children}</Text>;
}
export function Caption({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <Text style={[type.caption, { color: c.textMuted }]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: radius.lg,
          padding: space.lg,
          borderWidth: 1,
          borderColor: c.border,
          marginBottom: space.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'gold' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
}) {
  const { c } = useTheme();
  const bg = variant === 'primary' ? c.primary : variant === 'gold' ? c.accent : 'transparent';
  const fg = variant === 'primary' ? c.primaryText : variant === 'gold' ? c.accentText : c.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        backgroundColor: bg,
        borderColor: c.primary,
        borderWidth: variant === 'ghost' ? 1.5 : 0,
        borderRadius: radius.pill,
        paddingVertical: 14,
        paddingHorizontal: space.xl,
        alignItems: 'center',
        minHeight: 50,
      })}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[type.heading, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        backgroundColor: on ? c.primary : c.surfaceAlt,
        borderWidth: 1,
        borderColor: on ? c.primary : c.border,
      }}
    >
      <Text style={[type.caption, { color: on ? c.primaryText : c.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ marginBottom: space.md }}>
      {label ? <Caption>{label}</Caption> : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.textMuted}
        {...props}
        style={[
          {
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: radius.md,
            padding: space.md,
            color: c.text,
            backgroundColor: c.surface,
            marginTop: 4,
            fontSize: 16,
          },
          props.style,
        ]}
      />
    </View>
  );
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <Card style={{ alignItems: 'center' }}>
      <Text style={[type.heading, { marginBottom: space.xs, color: c.text }]}>{title}</Text>
      <Body muted style={{ textAlign: 'center', marginBottom: space.md }}>
        {message}
      </Body>
      {action}
    </Card>
  );
}

export function ProgressBar({ percent, color }: { percent: number; color?: string }) {
  const { c } = useTheme();
  const p = Math.max(0, Math.min(100, percent));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p) }}
      style={{ height: 8, borderRadius: 4, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}
    >
      <View style={{ width: `${p}%`, height: 8, backgroundColor: color ?? c.primary }} />
    </View>
  );
}

const styles = StyleSheet.create({ pad: { padding: space.lg, paddingBottom: 120 } });
