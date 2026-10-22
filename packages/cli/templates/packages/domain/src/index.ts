import { object, str, type AdminUser, type CreateThing, type Thing } from '@app/shared'

/**
 * Business logic, as plain TypeScript.
 *
 * No HTTP, no database, no framework: the API's route handlers are thin calls
 * into here, and storage comes in through the repository interfaces. That is
 * what keeps the rules testable without a server, and the same on every host.
 */

export interface ThingRepository {
  listForOwner(ownerId: string): Promise<Thing[]>
  insert(thing: Thing & { ownerId: string }): Promise<void>
}

export interface UserRepository {
  upsert(user: { id: string; email: string | null }): Promise<void>
  remove(id: string): Promise<void>
  list(limit: number): Promise<AdminUser[]>
}

const createThingInput = object({ name: str('name', { min: 1, max: 120 }) })

/** Validates at the boundary, then stores. Throws ValidationError on bad input. */
export async function createThing(
  repo: ThingRepository,
  ownerId: string,
  input: unknown,
  now: () => Date = () => new Date(),
): Promise<Thing> {
  const { name }: CreateThing = createThingInput(input)
  const thing: Thing = { id: crypto.randomUUID(), name, createdAt: now().toISOString() }
  await repo.insert({ ...thing, ownerId })
  return thing
}

export function listThings(repo: ThingRepository, ownerId: string): Promise<Thing[]> {
  return repo.listForOwner(ownerId)
}

/** Clerk is the source of truth for users; this keeps the local copy in step. */
export async function syncUser(
  repo: UserRepository,
  event: { type: string; data: { id?: string; email_addresses?: Array<{ email_address?: string }> } },
): Promise<'upserted' | 'removed' | 'ignored'> {
  const id = event.data.id
  if (!id) return 'ignored'
  if (event.type === 'user.created' || event.type === 'user.updated') {
    await repo.upsert({ id, email: event.data.email_addresses?.[0]?.email_address ?? null })
    return 'upserted'
  }
  if (event.type === 'user.deleted') {
    await repo.remove(id)
    return 'removed'
  }
  return 'ignored'
}
