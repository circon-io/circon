import '../src/global.css'
import { Stack } from 'expo-router'
import { Text, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { HeroUINativeProvider } from 'heroui-native'
import { ClerkProvider } from '@clerk/expo'
import { tokenCache } from '@clerk/expo/token-cache'
import { t } from '../src/i18n'

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY

/**
 * One app for iOS, Android and the web, including the admin area. Auth comes
 * from Clerk; every permission is enforced again by the API.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>
        {publishableKey ? (
          <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
            <Stack screenOptions={{ headerTitle: t('app.title') }} />
          </ClerkProvider>
        ) : (
          // Without a key there is no sign-in at all; say so instead of crashing,
          // so the gate and a fresh checkout both see a working screen.
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text testID="auth-not-configured" accessibilityLabel={t('auth.notConfigured')}>
              {t('auth.notConfigured')}
            </Text>
          </View>
        )}
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  )
}
