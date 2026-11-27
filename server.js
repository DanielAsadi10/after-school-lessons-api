import 'dotenv/config'
import express from 'express'
import { MongoClient } from 'mongodb'
import { fileURLToPath } from 'node:url'

const app = express()
const port = process.env.PORT || 3000
const mongoUri = process.env.MONGODB_URI
const databaseName = process.env.MONGODB_DB || 'after-school'
const imageDirectory = fileURLToPath(new URL('./public/images/', import.meta.url))
const allowedOrigins = new Set([
  'http://localhost:5173',
  process.env.FRONTEND_ORIGIN?.replace(/\/$/, ''),
].filter(Boolean))

// Log each request so API activity and failures are easier to trace in Render.
app.use((request, response, next) => {
  console.log(`${new Date().toISOString()} ${request.method} ${request.url}`)
  next()
})
// Parse JSON request bodies before route handlers read them.
app.use(express.json())
// Allow the local and configured frontend origins to call this API.
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
// Serve lesson image assets and return a clear 404 response for missing files.
app.use('/images', express.static(imageDirectory))
app.use('/images', (request, response) => {
  response.status(404).json({ error: 'Lesson image not found.' })
})

// Provide a simple health check for the deployed API.
app.get('/', (request, response) => {
  response.send('After school classes API is running.')
})

if (!mongoUri) {
  console.error('Missing MONGODB_URI. Add your Atlas connection string to express-app/.env.')
  process.exit(1)
}

const client = new MongoClient(mongoUri)

// Return teachers with a count of the lessons assigned to each one.
app.get('/teachers', async (request, response) => {
  try {
    const database = client.db(databaseName)
    const [teachers, lessons] = await Promise.all([
      database.collection('teachers').find({}, { projection: { _id: 0 } }).sort({ lastName: 1, firstName: 1 }).toArray(),
      database.collection('lessons').find({}, { projection: { _id: 0, id: 1, teacherId: 1 } }).toArray(),
    ])
    const lessonCounts = new Map()
    for (const lesson of lessons) {
      lessonCounts.set(lesson.teacherId, (lessonCounts.get(lesson.teacherId) || 0) + 1)
    }
    response.json(teachers.map((teacher) => ({
      ...teacher,
      lessonCount: lessonCounts.get(teacher.id) || 0,
    })))
  } catch (error) {
    console.error('Could not retrieve teachers from MongoDB:', error)
    response.status(500).json({ error: 'Could not retrieve teachers.' })
  }
})

// Return all lessons assigned to one teacher after validating their id.
app.get('/teachers/:teacherId/lessons', async (request, response) => {
  const teacherId = Number(request.params.teacherId)
  if (!Number.isInteger(teacherId)) return response.status(400).json({ error: 'Provide a valid teacher id.' })

  try {
    const database = client.db(databaseName)
    const teacher = await database.collection('teachers').findOne({ id: teacherId }, { projection: { _id: 0 } })
    if (!teacher) return response.status(404).json({ error: 'Teacher not found.' })

    const lessons = await database.collection('lessons')
      .find({ teacherId }, { projection: { _id: 0 } })
      .toArray()
    response.json(lessons)
  } catch (error) {
    console.error('Could not retrieve a teacher’s lessons from MongoDB:', error)
    response.status(500).json({ error: 'Could not retrieve lessons for this teacher.' })
  }
})

// Count ordered lesson places belonging to a teacher and include their profile.
app.get('/teachers/:teacherId/enrolment', async (request, response) => {
  const teacherId = Number(request.params.teacherId)
  if (!Number.isInteger(teacherId)) return response.status(400).json({ error: 'Provide a valid teacher id.' })

  try {
    const database = client.db(databaseName)
    const teacher = await database.collection('teachers').findOne({ id: teacherId }, { projection: { _id: 0 } })
    if (!teacher) return response.status(404).json({ error: 'Teacher not found.' })

    const lessonIds = await database.collection('lessons')
      .distinct('id', { teacherId })
    const [enrolment] = await database.collection('orders').aggregate([
      { $unwind: '$lessons' },
      { $match: { 'lessons.id': { $in: lessonIds } } },
      { $group: { _id: null, count: { $sum: { $ifNull: ['$lessons.quantity', 1] } } } },
    ]).toArray()

    response.json({ teacher, enrolment: enrolment?.count || 0 })
  } catch (error) {
    console.error('Could not calculate teacher enrolment from MongoDB:', error)
    response.status(500).json({ error: 'Could not calculate teacher enrolment.' })
  }
})

// Count purchased places for one lesson using the quantities stored in orders.
app.get('/enrolment/:lessonId', async (request, response) => {
  const lessonId = Number(request.params.lessonId)
  if (!Number.isInteger(lessonId)) return response.status(400).json({ error: 'Provide a valid lesson id.' })

  try {
    const database = client.db(databaseName)
    const lesson = await database.collection('lessons').findOne(
      { id: lessonId },
      { projection: { _id: 0, id: 1, subject: 1 } },
    )
    if (!lesson) return response.status(404).json({ error: 'Lesson not found.' })

    const [result] = await database.collection('orders').aggregate([
      { $unwind: '$lessons' },
      { $match: { 'lessons.id': lessonId } },
      { $group: { _id: null, enrolment: { $sum: { $ifNull: ['$lessons.quantity', 1] } } } },
    ]).toArray()

    response.json({ lessonId, subject: lesson.subject, enrolment: result?.enrolment || 0 })
  } catch (error) {
    console.error('Could not calculate lesson enrolment from MongoDB:', error)
    response.status(500).json({ error: 'Could not calculate lesson enrolment.' })
  }
})

// Search lesson text and numeric fields using a safely escaped query.
app.get('/lessons/search', async (request, response) => {
  const query = String(request.query.q || '').trim()
  if (!query) return response.status(400).json({ error: 'Enter a subject or location to search for.' })
  if (query.length > 100) return response.status(400).json({ error: 'Search text must be 100 characters or fewer.' })

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Build a MongoDB expression that lets text searches match numeric values.
  const numericFieldMatches = (field) => ({
    $expr: {
      $regexMatch: {
        input: { $ifNull: [{ $toString: `$${field}` }, ''] },
        regex: escapedQuery,
        options: 'i',
      },
    },
  })
  try {
    const matchingLessons = await client
      .db(databaseName)
      .collection('lessons')
      .aggregate([
        {
          $match: {
            $or: [
              { subject: { $regex: escapedQuery, $options: 'i' } },
              { location: { $regex: escapedQuery, $options: 'i' } },
              numericFieldMatches('price'),
              numericFieldMatches('spaces'),
            ],
          },
        },
        { $project: { _id: 0 } },
      ])
      .toArray()

    response.json(matchingLessons)
  } catch (error) {
    console.error('Could not search lessons in MongoDB:', error)
    response.status(500).json({ error: 'Could not search lessons.' })
  }
})

// Return every lesson for the class catalogue.
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

// Update allowed lesson fields, including remaining spaces after checkout.
app.put('/lessons/:id', async (request, response) => {
  const id = Number(request.params.id)
  const allowedFields = ['subject', 'location', 'price', 'spaces', 'icon', 'teacherId']
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

// Validate customer details and save a completed order in MongoDB.
app.post('/orders', async (request, response) => {
  const { name, phone, lessons: orderedLessons, total } = request.body || {}
  const normalizedName = typeof name === 'string' ? name.trim() : ''
  const normalizedPhone = typeof phone === 'string' ? phone.trim() : ''
  if (!normalizedName || !normalizedPhone) {
    return response.status(400).json({ error: 'A name and phone number are required.' })
  }
  if (!/^[A-Za-z ]{2,}$/.test(normalizedName) || !/[A-Za-z]/.test(normalizedName)) {
    return response.status(400).json({ error: 'Name must contain letters and spaces only.' })
  }
  if (!/^\d{7,20}$/.test(normalizedPhone)) {
    return response.status(400).json({ error: 'Phone number must contain 7 to 20 digits only.' })
  }
  if (!Array.isArray(orderedLessons) || orderedLessons.length === 0) {
    return response.status(400).json({ error: 'An order must contain at least one lesson.' })
  }

  try {
    const order = {
      name: normalizedName,
      phone: normalizedPhone,
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
