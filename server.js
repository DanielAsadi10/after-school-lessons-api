import 'dotenv/config'
import express from 'express'
import { MongoClient } from 'mongodb'

const app = express()
const port = process.env.PORT || 3000
const mongoUri = process.env.MONGODB_URI
const databaseName = process.env.MONGODB_DB || 'after-school'
const allowedOrigins = new Set([
  'http://localhost:5173',
  process.env.FRONTEND_ORIGIN?.replace(/\/$/, ''),
].filter(Boolean))

app.use(express.json())
app.use((request, response, next) => {
  const origin = request.headers.origin
  if (origin && !allowedOrigins.has(origin)) {
    return response.status(403).json({ error: 'This website is not allowed to access the API.' })
  }
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  }
  if (request.method === 'OPTIONS') return response.sendStatus(204)
  next()
})
app.use((request, response, next) => {
  console.log(`${new Date().toISOString()} ${request.method} ${request.url}`)
  next()
})

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

app.put('/lessons/:id', async (request, response) => {
  const id = Number(request.params.id)
  const allowedFields = ['subject', 'location', 'price', 'spaces', 'icon']
  const updates = Object.fromEntries(
    Object.entries(request.body || {}).filter(([field]) => allowedFields.includes(field)),
  )

  if (!Number.isInteger(id) || Object.keys(updates).length === 0) {
    return response.status(400).json({ error: 'Provide a valid lesson id and at least one lesson field to update.' })
  }
  if ('spaces' in updates && (!Number.isInteger(updates.spaces) || updates.spaces < 0)) {
    return response.status(400).json({ error: 'Spaces must be a non-negative whole number.' })
  }
  if ('price' in updates && (typeof updates.price !== 'number' || updates.price < 0)) {
    return response.status(400).json({ error: 'Price must be a non-negative number.' })
  }

  try {
    const result = await client.db(databaseName).collection('lessons').updateOne({ id }, { $set: updates })
    if (result.matchedCount === 0) return response.status(404).json({ error: 'Lesson not found.' })
    response.json({ message: 'Lesson updated.', id, updates })
  } catch (error) {
    console.error('Could not update lesson:', error)
    response.status(500).json({ error: 'Could not update lesson.' })
  }
})

app.post('/orders', async (request, response) => {
  const { name, phone, lessons: orderedLessons, total } = request.body || {}
  if (typeof name !== 'string' || !name.trim() || typeof phone !== 'string' || !phone.trim()) {
    return response.status(400).json({ error: 'A name and phone number are required.' })
  }
  if (!Array.isArray(orderedLessons) || orderedLessons.length === 0) {
    return response.status(400).json({ error: 'An order must contain at least one lesson.' })
  }

  try {
    const order = {
      name: name.trim(),
      phone: phone.trim(),
      lessons: orderedLessons,
      total: Number(total) || 0,
      createdAt: new Date(),
    }
    const result = await client.db(databaseName).collection('orders').insertOne(order)
    response.status(201).json({ message: 'Order saved.', orderId: result.insertedId })
  } catch (error) {
    console.error('Could not save order:', error)
    response.status(500).json({ error: 'Could not save order.' })
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
