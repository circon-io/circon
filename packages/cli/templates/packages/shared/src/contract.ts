/**
 * The API's request and response shapes. The client and the server both import
 * these, so a payload that changes on one side and not the other is a build
 * error, not a production surprise.
 */

export interface Me {
  id: string
  email: string | null
  /** The active organization, when the user has one selected. */
  orgId: string | null
  /** Normalized: `admin` or `member`, without Clerk's `org:` prefix. */
  role: 'admin' | 'member' | null
}

export interface Thing {
  id: string
  name: string
  createdAt: string
}

export interface CreateThing {
  name: string
}

export interface AdminUser {
  id: string
  email: string | null
  createdAt: string
}
