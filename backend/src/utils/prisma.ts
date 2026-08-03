import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'

// NOTE: dotenv.config() is intentionally NOT called here.
// DATABASE_URL is loaded by:
//   - Production/dev: src/index.ts calls dotenv.config() before this module loads
//   - Integration tests: the npm test:integration script sets DATABASE_URL=zoink_test
//     in the process environment before Node starts, so no dotenv call is needed
//     and index.ts guards dotenv.config() behind NODE_ENV !== 'test'.
//
// This module is evaluated once and the PrismaClient is created immediately with
// whatever DATABASE_URL is in process.env at that moment. Because the test script
// sets DATABASE_URL at process start (not at runtime), there is no race condition.

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as any)

export default prisma
