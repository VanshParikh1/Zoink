import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import cron from 'node-cron'
import authRouter from './routes/auth'
import usersRouter from './routes/users'
import listingsRouter from './routes/listings'
import bookingsRouter from './routes/bookings'
import conversationsRouter from './routes/conversations'
import reviewsRouter from './routes/reviews'
import disputesRouter from './routes/disputes'
import adminRouter from './routes/admin'
import { stripeWebhook } from './middleware/controllers/stripeWebhookController'
import { requireAuth } from './middleware/requireAuth'
import { getStripeConnectStatus } from './middleware/controllers/userController'
import { cleanupStaleHandoffs, releaseDuePayouts } from './services/cleanupJob'
import { reconcileStripePayments } from './services/reconciliationJob'
import { errorHandler } from './middleware/errorHandler'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook)
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook)
app.use(express.json())

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Zoink API' })
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Zoink API is running' })
})

function sendStripeConnectRedirectPage(res: express.Response, title: string, message: string) {
  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f4ede1;
        color: #101510;
      }
      main {
        width: min(420px, calc(100vw - 40px));
        text-align: center;
      }
      h1 {
        font-size: 28px;
        margin: 0 0 12px;
      }
      p {
        color: #4d5a4d;
        line-height: 1.5;
        margin: 0 0 24px;
      }
      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
        padding: 0 22px;
        border-radius: 12px;
        background: #0fff50;
        color: #071107;
        font-weight: 800;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${message}</p>
      <a href="zoink://">Open Zoink</a>
    </main>
  </body>
</html>`)
}

app.get('/stripe-return', (_req, res) => {
  sendStripeConnectRedirectPage(res, 'Payout setup complete', 'Return to Zoink and refresh your profile to see your payout status.')
})

app.get('/stripe-refresh', (_req, res) => {
  sendStripeConnectRedirectPage(res, 'Payout setup needs another try', 'Your Stripe setup link expired. Open Zoink and start payout setup again.')
})

app.get('/stripe/connect/status', requireAuth, getStripeConnectStatus)

app.use('/auth', authRouter)
app.use('/users', usersRouter)
app.use('/listings', listingsRouter)
app.use('/bookings', bookingsRouter)
app.use('/conversations', conversationsRouter)
app.use('/reviews', reviewsRouter)
app.use('/disputes', disputesRouter)
app.use('/admin', adminRouter)

app.use(errorHandler)

if (process.env.NODE_ENV !== 'test') {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const handoffs = await cleanupStaleHandoffs()
      const payouts = await releaseDuePayouts()
      console.log('Cleanup job completed:', { handoffs, payouts })
    } catch (error) {
      console.error('Cleanup job failed:', error)
    }
  })

  cron.schedule('0 * * * *', async () => {
    try {
      const result = await reconcileStripePayments()
      console.log('Reconciliation job completed:', result)
    } catch (error) {
      console.error('Reconciliation job failed:', error)
    }
  })

  console.log('Scheduled cleanup job every 15 minutes and reconciliation job every hour.')
}

const server = app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Zoink API running on port ${PORT} across all interfaces (0.0.0.0)`)
})

server.on('error', (e: any) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use! Please kill the process using it.`)
    process.exit(1)
  } else {
    console.error('Server error:', e)
  }
})

export default app
