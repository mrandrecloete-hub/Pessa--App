import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
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
    <View style={styles.pad}>{children}</View>
  );
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      {body}
    </SafeAreaView>
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
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.border,
          shadowColor: c.shadow,
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
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
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
}) {
  const { c } = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        backgroundColor: primary ? c.primary : 'transparent',
        borderColor: c.primary,
        borderWidth: primary ? 0 : 1.5,
        borderRadius: radius.pill,
        paddingVertical: 14,
        paddingHorizontal: space.xl,
        alignItems: 'center',
        minHeight: 48,
      })}
    >
      {loading ? (
        <ActivityIndicator color={primary ? c.primaryText : c.primary} />
      ) : (
        <Text style={[type.heading, { color: primary ? c.primaryText : c.primary }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <Card style={{ alignItems: 'center' }}>
      <Text style={[type.heading, { marginBottom: space.xs }, { color: useTheme().c.text }]}>{title}</Text>
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
