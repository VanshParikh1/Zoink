import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRouter from './routes/auth'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Zoink API is running' })
})

app.use('/auth', authRouter)  // moved up

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Zoink API running on port ${PORT} across all interfaces (0.0.0.0)`)
})

export default app