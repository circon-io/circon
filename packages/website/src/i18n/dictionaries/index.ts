import type { Locale } from '../config'
import { de } from './de'
import { en, type Dictionary } from './en'

const dictionaries: Record<Locale, Dictionary> = { en, de }

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale]
}

export type { Dictionary }
