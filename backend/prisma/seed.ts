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
      stripeAccountId: process.env.DEV_STRIPE_ACCOUNT_ID || undefined,
    },
  })

  console.log('Seeded user:', user.email)

  // Seed some sample listings
  const listingsCount = await prisma.listing.count()
  if (listingsCount === 0) {
    const categories = ['Electronics', 'Tools', 'Sports', 'Outdoors']
    
    await prisma.listing.create({
      data: {
        title: 'Sony A7III Camera',
        description: 'Professional full-frame mirrorless camera. Includes 24-70mm lens.',
        category: 'Electronics',
        dailyPrice: 45.00,
        city: 'Toronto',
        latitude: 43.6532,
        longitude: -79.3832,
        ownerId: user.id,
        isAvailable: true,
      }
    })

    await prisma.listing.create({
      data: {
        title: 'Makita Power Drill',
        description: 'High torque power drill with 2 batteries and charger.',
        category: 'Tools',
        dailyPrice: 15.00,
        city: 'Toronto',
        latitude: 43.6532,
        longitude: -79.3832,
        ownerId: user.id,
        isAvailable: true,
      }
    })

    console.log('Seeded sample listings in Toronto')
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
