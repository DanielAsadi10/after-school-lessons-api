# after-school-lessons-api
Express and MongoDB Atlas API for the after-school lessons app.

## Seed lessons and teachers

With `MONGODB_URI` and `MONGODB_DB` set in `express-app/.env`, run:

```sh
npm run seed:lessons
```

The seed command adds missing sample lessons, updates their icons and teacher assignments, and upserts the sample teachers. It does not reset existing lesson prices or spaces.

## Routes

- `GET /lessons` returns the lessons.
- `GET /lessons/search?q=...` searches lesson subject and location, and exact numeric prices and spaces.
- `PUT /lessons/:id` updates a lesson.
- `POST /orders` saves an order.
- `GET /teachers` lists teachers and their class counts.
- `GET /teachers/:teacherId/lessons` returns a teacher's classes.
- `GET /teachers/:teacherId/enrolment` returns the total number of booked spaces across that teacher's classes, calculated from saved orders.
