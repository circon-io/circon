import type { PageId } from '@/i18n/config'
import { imprint } from './imprint'
import { privacy } from './privacy'
import type { LegalDocument } from './types'

export const legalDocuments: Record<PageId, LegalDocument> = { imprint, privacy }
