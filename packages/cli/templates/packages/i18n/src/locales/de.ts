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
}
