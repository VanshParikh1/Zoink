import dotenv from 'dotenv'
dotenv.config()

import prisma from '../utils/prisma'
import { parseEmailArg } from './manageAdminRole'
import { suspendUser, unsuspendUser } from '../services/suspensionService'

// ── Internal CLI tool for suspending/unsuspending an account by email ────────
// The same as POST /admin/users/:id/suspend|unsuspend. See README.md
// "Suspending an account". Usage:
//   npm run user:suspend -- --email=student@mail.utoronto.ca
//   npm run user:unsuspend -- --email=student@mail.utoronto.ca

async function main() {
  const action = process.argv[2]
  if (action !== 'suspend' && action !== 'unsuspend') {
    console.error('Usage: manageSuspension.ts <suspend|unsuspend> --email=<address>')
    process.exitCode = 1
    return
  }

  const email = parseEmailArg(process.argv.slice(3))
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } })
  if (!user) {
    console.error(`No user found with email "${email}". Nothing was changed.`)
    process.exitCode = 1
    return
  }

  const outcome = action === 'suspend' ? await suspendUser(user.id) : await unsuspendUser(user.id)
  const state = outcome.suspendedAt ? `suspended since ${outcome.suspendedAt.toISOString()}` : 'not suspended'
  console.log(`${outcome.changed ? 'Changed' : 'No change'}: ${outcome.email} is ${state}.`)
  console.log(`  user id: ${outcome.userId}`)
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('manageSuspension failed:', error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
