import 'dotenv/config'
import express from 'express'
import { MongoClient } from 'mongodb'

const app = express()
const port = process.env.PORT || 3000
const mongoUri = process.env.MONGODB_URI
const databaseName = process.env.MONGODB_DB || 'after-school'

app.use(express.json())

app.get('/', (request, response) => {
  response.send('After school classes API is running.')
})

if (!mongoUri) {
  console.error('Missing MONGODB_URI. Add your Atlas connection string to express-app/.env.')
  process.exit(1)
}

const client = new MongoClient(mongoUri)

app.get('/lessons', async (request, response) => {
  try {
    const lessons = await client
      .db(databaseName)
      .collection('lessons')
      .find({}, { projection: { _id: 0 } })
      .toArray()

    response.json(lessons)
  } catch (error) {
    console.error('Could not retrieve lessons from MongoDB:', error)
    response.status(500).json({ error: 'Could not retrieve lessons.' })
  }
})

try {
  await client.connect()
  await client.db(databaseName).command({ ping: 1 })
  console.log(`Connected to MongoDB database "${databaseName}".`)

  app.listen(port, () => {
    console.log(`API listening on port ${port}`)
  })
} catch (error) {
  console.error('Could not connect to MongoDB Atlas:', error.message)
  await client.close().catch(() => {})
  process.exit(1)
}
