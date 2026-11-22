import 'dotenv/config'
import { MongoClient } from 'mongodb'

const mongoUri = process.env.MONGODB_URI
const databaseName = process.env.MONGODB_DB || 'after-school'

const lessons = [
  { id: 1, subject: 'Python for Beginners', location: 'Hendon', price: 45, spaces: 5, icon: 'fa-solid fa-code' },
  { id: 2, subject: 'Build Your First Website', location: 'Colindale', price: 50, spaces: 5, icon: 'fa-solid fa-globe' },
  { id: 3, subject: 'Scratch Game Design', location: 'Brent Cross', price: 35, spaces: 5, icon: 'fa-solid fa-gamepad' },
  { id: 4, subject: 'Robotics Club', location: 'Golders Green', price: 60, spaces: 5, icon: 'fa-solid fa-robot' },
  { id: 5, subject: 'Creative Coding', location: 'Hendon', price: 40, spaces: 5, icon: 'fa-solid fa-palette' },
  { id: 6, subject: 'JavaScript Explorers', location: 'Colindale', price: 55, spaces: 5, icon: 'fa-brands fa-js' },
  { id: 7, subject: 'Make a Mobile App', location: 'Brent Cross', price: 65, spaces: 5, icon: 'fa-solid fa-mobile-screen-button' },
  { id: 8, subject: 'Minecraft Modding', location: 'Golders Green', price: 50, spaces: 5, icon: 'fa-solid fa-cubes' },
  { id: 9, subject: 'Web Design Studio', location: 'Hendon', price: 45, spaces: 5, icon: 'fa-solid fa-pen-ruler' },
  { id: 10, subject: 'AI and Machine Learning Basics', location: 'Colindale', price: 70, spaces: 5, icon: 'fa-solid fa-brain' },
]

if (!mongoUri) {
  console.error('Missing MONGODB_URI. Add your Atlas connection string to express-app/.env.')
  process.exit(1)
}

const client = new MongoClient(mongoUri)

try {
  await client.connect()
  const collection = client.db(databaseName).collection('lessons')

  const result = await collection.bulkWrite(
    lessons.map((lesson) => ({
      updateOne: {
        filter: { id: lesson.id },
        update: {
          $set: { icon: lesson.icon },
          $setOnInsert: {
            subject: lesson.subject,
            location: lesson.location,
            price: lesson.price,
            spaces: lesson.spaces,
          },
        },
        upsert: true,
      },
    })),
  )

  console.log(`Added ${result.upsertedCount} missing lessons and set icons for ${result.matchedCount} existing lessons.`)
} catch (error) {
  console.error('Could not seed lessons:', error.message)
  process.exitCode = 1
} finally {
  await client.close()
}
