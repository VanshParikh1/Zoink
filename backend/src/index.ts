import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRouter from './routes/auth'
import usersRouter from './routes/users'
import listingsRouter from './routes/listings'
import bookingsRouter from './routes/bookings'
import conversationsRouter from './routes/conversations'
import reviewsRouter from './routes/reviews'
import { stripeWebhook } from './middleware/controllers/stripeWebhookController'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook)
app.use(express.json())

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Zoink API' })
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Zoink API is running' })
})

app.use('/auth', authRouter)
app.use('/users', usersRouter)
app.use('/listings', listingsRouter)
app.use('/bookings', bookingsRouter)
app.use('/conversations', conversationsRouter)
app.use('/reviews', reviewsRouter)

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
