import { getLocales } from 'expo-localization'
import { negotiate, translator } from '@app/i18n'

/** The device's language when we have it, English otherwise. Both are first-class. */
export const t = translator(negotiate(getLocales().map((l) => l.languageTag)))
