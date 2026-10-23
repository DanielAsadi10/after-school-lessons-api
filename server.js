import express from 'express'

const app = express()
const port = process.env.PORT || 3000

app.use(express.json())

app.get('/lessons', (request, response) => {
  response.json([
    { id: 1, subject: 'Python for Beginners', location: 'Hendon', price: 45, spaces: 5 },
    { id: 2, subject: 'Build Your First Website', location: 'Colindale', price: 50, spaces: 5 },
  ])
})

app.listen(port, () => {
  console.log(`API listening on port ${port}`)
})
