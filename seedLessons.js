import 'dotenv/config'
import { MongoClient } from 'mongodb'

const mongoUri = process.env.MONGODB_URI
const databaseName = process.env.MONGODB_DB || 'after-school'

const lessons = [
  { id: 1, subject: 'Python for Beginners', location: 'Hendon', price: 45, spaces: 5, icon: 'fa-solid fa-code', teacherId: 1 },
  { id: 2, subject: 'Build Your First Website', location: 'Colindale', price: 50, spaces: 5, icon: 'fa-solid fa-globe', teacherId: 2 },
  { id: 3, subject: 'Scratch Game Design', location: 'Brent Cross', price: 35, spaces: 5, icon: 'fa-solid fa-gamepad', teacherId: 3 },
  { id: 4, subject: 'Robotics Club', location: 'Golders Green', price: 60, spaces: 5, icon: 'fa-solid fa-robot', teacherId: 4 },
  { id: 5, subject: 'Creative Coding', location: 'Hendon', price: 40, spaces: 5, icon: 'fa-solid fa-palette', teacherId: 1 },
  { id: 6, subject: 'JavaScript Explorers', location: 'Colindale', price: 55, spaces: 5, icon: 'fa-brands fa-js', teacherId: 2 },
  { id: 7, subject: 'Make a Mobile App', location: 'Brent Cross', price: 65, spaces: 5, icon: 'fa-solid fa-mobile-screen-button', teacherId: 3 },
  { id: 8, subject: 'Minecraft Modding', location: 'Golders Green', price: 50, spaces: 5, icon: 'fa-solid fa-cubes', teacherId: 4 },
  { id: 9, subject: 'Web Design Studio', location: 'Hendon', price: 45, spaces: 5, icon: 'fa-solid fa-pen-ruler', teacherId: 1 },
  { id: 10, subject: 'AI and Machine Learning Basics', location: 'Colindale', price: 70, spaces: 5, icon: 'fa-solid fa-brain', teacherId: 2 },
]

const teachers = [
  { id: 1, firstName: 'Amira', lastName: 'Khan' },
  { id: 2, firstName: 'Daniel', lastName: 'Reed' },
  { id: 3, firstName: 'Sofia', lastName: 'Patel' },
  { id: 4, firstName: 'Leo', lastName: 'Morgan' },
]

if (!mongoUri) {
  console.error('Missing MONGODB_URI. Add your Atlas connection string to express-app/.env.')
  process.exit(1)
}

const client = new MongoClient(mongoUri)

try {
  await client.connect()
  const collection = client.db(databaseName).collection('lessons')
  const teachersCollection = client.db(databaseName).collection('teachers')

  const result = await collection.bulkWrite(
    lessons.map((lesson) => ({
      updateOne: {
        filter: { id: lesson.id },
        update: {
          $set: { icon: lesson.icon, teacherId: lesson.teacherId },
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

  const teacherResult = await teachersCollection.bulkWrite(
    teachers.map((teacher) => ({
      updateOne: {
        filter: { id: teacher.id },
        update: { $set: { firstName: teacher.firstName, lastName: teacher.lastName } },
        upsert: true,
      },
    })),
  )

  console.log(`Seeded lesson teacher assignments and ${teacherResult.upsertedCount} new teachers.`)
} catch (error) {
  console.error('Could not seed lessons:', error.message)
  process.exitCode = 1
} finally {
  await client.close()
}
