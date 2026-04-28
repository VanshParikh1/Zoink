import prisma from '../src/utils/prisma'
import { VerificationStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'

dotenv.config()

async function main() {
  const hashed = await bcrypt.hash('password123', 10)

  const user = await prisma.user.upsert({
    where: { email: 'test@rutgers.edu' },
    update: {},
    create: {
      email: 'test@rutgers.edu',
      passwordHash: hashed,
      firstName: 'Test',
      lastName: 'User',
      verificationStatus: VerificationStatus.VERIFIED,
      verifiedAt: new Date(),
    },
  })

  console.log('Seeded user:', user.email)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())