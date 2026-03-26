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

app.listen(PORT, () => {
  console.log(`Zoink API running on port ${PORT}`)
})

app.use('/auth', authRouter)

export default app

