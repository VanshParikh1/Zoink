import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
import { Pool } from 'pg'

dotenv.config()

// Setting up the PostgreSQL Pool for the Prisma Adapter
const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

export default prisma