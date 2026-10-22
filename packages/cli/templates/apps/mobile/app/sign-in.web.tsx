import { View } from 'react-native'
import { Redirect } from 'expo-router'
import { useAuth } from '@clerk/expo'
import { SignIn as ClerkSignIn } from '@clerk/expo/web'

/** On the web, Clerk's own sign-in component, in the page. */
export default function SignIn() {
  const { isSignedIn } = useAuth()
  if (isSignedIn) return <Redirect href="/" />
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <ClerkSignIn />
    </View>
  )
}
