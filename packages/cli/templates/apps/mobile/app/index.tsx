import { useCallback, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { Link, Redirect } from 'expo-router'
import { useAuth } from '@clerk/expo'
import type { Thing } from '@app/shared'
import { Button, Spinner, TextField } from '@app/ui'
import { useApi } from '../src/api'
import { useAsync } from '../src/use-async'
import { t } from '../src/i18n'

export default function Home() {
  const { isLoaded, isSignedIn, orgRole, signOut } = useAuth()
  if (!isLoaded) return <Spinner />
  if (!isSignedIn) return <Redirect href="/sign-in" />
  return <Things isAdmin={orgRole === 'org:admin'} onSignOut={() => void signOut()} />
}

function Things({ isAdmin, onSignOut }: { isAdmin: boolean; onSignOut: () => void }) {
  const api = useApi()
  const load = useCallback(() => api.listThings(), [api])
  const isEmpty = useCallback((rows: Thing[]) => rows.length === 0, [])
  const { view, reload } = useAsync(load, isEmpty, t('things.loadError'))
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.createThing({ name })
      setName('')
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: '600' }}>
        {t('things.title')}
      </Text>

      <TextField
        testID="new-thing"
        accessibilityLabel={t('things.newLabel')}
        label={t('things.newLabel')}
        value={name}
        onChangeText={setName}
        onSubmitEditing={() => void add()}
        error={error}
      />
      <Button testID="add-thing" accessibilityLabel={t('things.add')} onPress={() => void add()} loading={saving} disabled={!name.trim()}>
        {t('things.add')}
      </Button>

      {view.state === 'loading' && <Spinner />}
      {view.state === 'error' && (
        <View style={{ gap: 8 }}>
          <Text>{view.error}</Text>
          <Button testID="retry-things" accessibilityLabel={t('common.retry')} variant="outline" onPress={reload}>
            {t('common.retry')}
          </Button>
        </View>
      )}
      {view.state === 'empty' && <Text testID="things-empty">{t('things.empty')}</Text>}
      {view.state === 'ready' &&
        view.data.map((thing) => (
          <Text key={thing.id} testID={`thing-${thing.id}`} accessibilityLabel={thing.name}>
            {thing.name}
          </Text>
        ))}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        {isAdmin && (
          <Link href="/users" testID="open-admin" accessibilityLabel={t('admin.open')}>
            {t('admin.open')}
          </Link>
        )}
        <Button testID="sign-out" accessibilityLabel={t('auth.signOut')} variant="outline" onPress={onSignOut}>
          {t('auth.signOut')}
        </Button>
      </View>
    </ScrollView>
  )
}
