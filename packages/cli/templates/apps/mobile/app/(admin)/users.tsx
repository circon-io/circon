import { useCallback } from 'react'
import { ScrollView, Text } from 'react-native'
import type { AdminUser } from '@app/shared'
import { Button, Spinner } from '@app/ui'
import { useApi } from '../../src/api'
import { useAsync } from '../../src/use-async'
import { t } from '../../src/i18n'

export default function Users() {
  const api = useApi()
  const load = useCallback(() => api.adminUsers(), [api])
  const isEmpty = useCallback((rows: AdminUser[]) => rows.length === 0, [])
  const { view, reload } = useAsync(load, isEmpty, t('admin.users.loadError'))

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: '600' }}>
        {t('admin.users.title')}
      </Text>
      {view.state === 'loading' && <Spinner />}
      {view.state === 'error' && (
        <Button testID="retry-users" accessibilityLabel={t('common.retry')} variant="outline" onPress={reload}>
          {t('common.retry')}
        </Button>
      )}
      {view.state === 'empty' && <Text>{t('admin.users.empty')}</Text>}
      {view.state === 'ready' &&
        view.data.map((user) => (
          <Text key={user.id} testID={`user-${user.id}`} accessibilityLabel={user.email ?? user.id}>
            {user.email ?? user.id}
          </Text>
        ))}
    </ScrollView>
  )
}
