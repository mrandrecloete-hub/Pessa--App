import { router } from 'expo-router';
import { Image, Text, View } from 'react-native';
import splash from '../../assets/images/splash-icon.png';
import { Button, Caption, Screen } from '@/components/ui';
import { usePrefs } from '@/stores/preferences';
import { space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function Welcome() {
  const { c } = useTheme();
  const setOnboarded = usePrefs((s) => s.setOnboarded);
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Image
          source={splash}
          accessibilityLabel="MONEVA logo"
          style={{ width: 240, height: 240, borderRadius: 48, marginBottom: space.xl }}
        />
        <Text style={[type.display, { color: c.accent, letterSpacing: 2 }]}>MONEVA</Text>
        <Text style={[type.heading, { color: c.text, marginTop: space.sm }]}>Take Control. Build Wealth.</Text>
        <Text style={[type.body, { color: c.textMuted, textAlign: 'center', marginTop: space.md, paddingHorizontal: space.lg }]}>
          Your smart financial companion for a healthier future.
        </Text>
      </View>
      <View style={{ gap: space.md }}>
        <Button
          title="Get Started"
          variant="gold"
          onPress={() => {
            setOnboarded(true);
            router.replace('/');
          }}
        />
        <Button title="Sign in" variant="ghost" onPress={() => router.push('/login')} />
        <Caption>You can start on this device without an account. Your records stay on your phone until you sign in.</Caption>
      </View>
    </Screen>
  );
}
