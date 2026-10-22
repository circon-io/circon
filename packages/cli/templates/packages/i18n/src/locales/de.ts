import type { en } from './en.ts'

/** Typed against English, so a new key fails the build until it is translated. */
export const de: Record<keyof typeof en, string> = {
  'auth.signIn.title': 'Anmelden',
  'auth.signIn.submit': 'Anmelden',
  'auth.signIn.emailLabel': 'E-Mail-Adresse',
  'auth.signIn.passwordLabel': 'Passwort',
  'common.retry': 'Erneut versuchen',
  'common.loading': 'Wird geladen…',
  'common.empty': 'Noch nichts vorhanden',
  'error.generic': 'Etwas ist schiefgelaufen.',
  'error.offline': 'Du scheinst offline zu sein.',
  'app.title': '__PROJECT_NAME__',
  'auth.signIn.continue': 'Weiter',
  'auth.signIn.intro': 'Melde dich an, um fortzufahren.',
  'auth.signOut': 'Abmelden',
  'auth.notConfigured': 'Die Anmeldung ist nicht eingerichtet. Setze EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY.',
  'things.title': 'Deine Dinge',
  'things.newLabel': 'Neues Ding',
  'things.add': 'Ding hinzufügen',
  'things.empty': 'Noch nichts da. Füge oben dein erstes Ding hinzu.',
  'things.loadError': 'Deine Dinge konnten nicht geladen werden.',
  'admin.open': 'Verwaltung',
  'admin.users.title': 'Benutzer',
  'admin.users.empty': 'Noch keine Benutzer.',
  'admin.users.loadError': 'Benutzer konnten nicht geladen werden.',
}
