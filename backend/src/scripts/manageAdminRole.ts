import dotenv from 'dotenv'
dotenv.config()

import prisma from '../utils/prisma'
import { Role } from '@prisma/client'

// ── Internal CLI tool for granting/revoking the ADMIN role by email ──────────
// Replaces manually editing prisma/seed.ts or the database to make someone an
// admin. See README.md "Managing the Admin Role" for usage.

export type AdminRoleOutcome =
  | { status: 'refused'; message: string }
  | {
      status: 'noop' | 'changed'
      message: string
      userId: string
      email: string
      roleBefore: Role
      roleAfter: Role
    }

export function parseEmailArg(argv: string[]): string {
  const arg = argv.find((a) => a.startsWith('--email='))
  const value = arg?.slice('--email='.length).trim()
  if (!value) {
    throw new Error('Usage: --email=<address> is required.')
  }
  return value
}

async function findUserByEmail(email: string, db: typeof prisma) {
  // Case-insensitive: User.email has no normalization enforced elsewhere in the
  // codebase (authService reads/writes it as-is), so match loosely here rather
  // than risk a no-op lookup over a casing mismatch.
  return db.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  })
}

export async function grantAdminRole(email: string, db: typeof prisma = prisma): Promise<AdminRoleOutcome> {
  const user = await findUserByEmail(email, db)
  if (!user) {
    return { status: 'refused', message: `No user found with email "${email}". Nothing was changed.` }
  }

  if (user.role === Role.ADMIN) {
    return {
      status: 'noop',
      message: `${user.email} is already ADMIN. No change made.`,
      userId: user.id,
      email: user.email,
      roleBefore: user.role,
      roleAfter: user.role,
    }
  }

  const roleBefore = user.role
  const updated = await db.user.update({ where: { id: user.id }, data: { role: Role.ADMIN } })
  return {
    status: 'changed',
    message: `Granted ADMIN to ${updated.email}.`,
    userId: updated.id,
    email: updated.email,
    roleBefore,
    roleAfter: updated.role,
  }
}

export async function revokeAdminRole(email: string, db: typeof prisma = prisma): Promise<AdminRoleOutcome> {
  const user = await findUserByEmail(email, db)
  if (!user) {
    return { status: 'refused', message: `No user found with email "${email}". Nothing was changed.` }
  }

  if (user.role === Role.USER) {
    return {
      status: 'noop',
      message: `${user.email} is already USER (not an admin). No change made.`,
      userId: user.id,
      email: user.email,
      roleBefore: user.role,
      roleAfter: user.role,
    }
  }

  const adminCount = await db.user.count({ where: { role: Role.ADMIN } })
  if (adminCount <= 1) {
    return {
      status: 'refused',
      message:
        `Refusing to revoke ADMIN from ${user.email}: they are the only remaining admin. ` +
        `Grant ADMIN to another user first, then retry.`,
    }
  }

  const roleBefore = user.role
  const updated = await db.user.update({ where: { id: user.id }, data: { role: Role.USER } })
  return {
    status: 'changed',
    message: `Revoked ADMIN from ${updated.email}.`,
    userId: updated.id,
    email: updated.email,
    roleBefore,
    roleAfter: updated.role,
  }
}

// ── CLI entry point ───────────────────────────────────────────────────────────

async function main() {
  const action = process.argv[2]
  if (action !== 'grant' && action !== 'revoke') {
    console.error('Usage: manageAdminRole.ts <grant|revoke> --email=<address>')
    process.exitCode = 1
    return
  }

  const email = parseEmailArg(process.argv.slice(3))
  const outcome = action === 'grant' ? await grantAdminRole(email) : await revokeAdminRole(email)

  if (outcome.status === 'refused') {
    console.error(outcome.message)
    process.exitCode = 1
    return
  }

  console.log(outcome.message)
  console.log(`  user id: ${outcome.userId}`)
  console.log(`  email:   ${outcome.email}`)
  console.log(`  role:    ${outcome.roleBefore} -> ${outcome.roleAfter}`)
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('manageAdminRole failed:', error)
      process.exitCode = 1
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
