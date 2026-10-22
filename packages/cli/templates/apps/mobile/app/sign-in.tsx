import { useState } from 'react'
import { Text, View } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { useAuth } from '@clerk/expo'
import { useHostedAuth } from '@clerk/expo/hosted-auth'
import { Button } from '@app/ui'
import { t } from '../src/i18n'

/**
 * Native sign-in through Clerk's hosted pages: email, social and passkeys all
 * work without building any of it here. The web version is sign-in.web.tsx.
 */
export default function SignIn() {
  const { isSignedIn } = useAuth()
  const { startHostedAuth } = useHostedAuth()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  if (isSignedIn) return <Redirect href="/" />

  const go = async () => {
    setBusy(true)
    try {
      const { createdSessionId } = await startHostedAuth({ mode: 'sign-in' })
      if (createdSessionId) router.replace('/')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
      <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: '600' }}>
        {t('auth.signIn.title')}
      </Text>
      <Text>{t('auth.signIn.intro')}</Text>
      <Button testID="sign-in" accessibilityLabel={t('auth.signIn.continue')} onPress={() => void go()} loading={busy}>
        {t('auth.signIn.continue')}
      </Button>
    </View>
  )
}
