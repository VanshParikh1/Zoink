// Serves the API on :3000 against zoink_bench for on-device measurement
// (cold start, list scrolling) with the same network-free setup as run.ts.
//   npx ts-node src/scripts/bench/serve.ts [--seed]
// --seed truncates and reseeds first. Every seeded account's password is
// BENCH_PASSWORD (see seed.ts); the main browsing account is renter1@mail.utoronto.ca.
import './benchEnv'
import { seed } from './seed'

async function main() {
  if (process.argv.includes('--seed')) {
    console.log('Seeding zoink_bench…')
    await seed()
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const app = require('../../index').default
  const port = Number(process.env.PORT || 3000)
  app.listen(port, '0.0.0.0', () => console.log(`Bench API on http://localhost:${port} (zoink_bench, Stripe mocked)`))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
