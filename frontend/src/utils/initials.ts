import { User } from '../types'

/** "MM" for Mihir Mistry. */
export function initialsOf(user: Pick<User, 'firstName' | 'lastName'>) {
  return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase()
}
