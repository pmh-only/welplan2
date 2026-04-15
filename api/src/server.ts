import { Hono } from 'hono'
import { CafeteriaService, CafeteriaServiceError } from './service/CafeteriaService.js'

const service = new CafeteriaService()

const app = new Hono()

// Global error handler
app.onError((err, c) => {
  if (err instanceof CafeteriaServiceError) {
    return c.json({ error: err.message }, err.statusCode as 404 | 501 | 500)
  }
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

// GET /restaurants
// Returns all restaurants from both vendors
app.get('/restaurants', async (c) => {
  const restaurants = await service.getRestaurants()
  return c.json(restaurants)
})

// GET /restaurants/:id/meal-times
app.get('/restaurants/:id/meal-times', async (c) => {
  const id = c.req.param('id')
  const mealTimes = await service.getMealTimes(id)
  return c.json(mealTimes)
})

// GET /restaurants/:id/menus?date=YYYYMMDD&mealTimeId=xxx
app.get('/restaurants/:id/menus', async (c) => {
  const id = c.req.param('id')
  const { date, mealTimeId } = c.req.query()

  if (!date || !mealTimeId) {
    return c.json({ error: 'Missing required query params: date, mealTimeId' }, 400)
  }

  const menus = await service.getMenus(id, date, mealTimeId)
  return c.json(menus)
})

// GET /restaurants/meal-times
// Returns unique meal times aggregated from all registered restaurants
app.get('/restaurants/meal-times', async (c) => {
  const mealTimes = await service.getAllMealTimes()
  return c.json(mealTimes)
})

// GET /restaurants/menus?date=YYYYMMDD&mealTimeId=xxx
// Returns all menus from all registered restaurants
app.get('/restaurants/menus', async (c) => {
  const { date, mealTimeId } = c.req.query()
  if (!date || !mealTimeId) {
    return c.json({ error: 'Missing required query params: date, mealTimeId' }, 400)
  }
  const menus = await service.getAllMenus(date, mealTimeId)
  return c.json(menus)
})

// GET /restaurants/search?q=QUERY
// Searches all restaurants by name (Welstory only)
app.get('/restaurants/search', async (c) => {
  const q = c.req.query('q') ?? ''
  const results = await service.searchRestaurants(q)
  return c.json(results)
})

// POST /restaurants/:id/add
// Adds a restaurant to the user's my-list
app.post('/restaurants/:id/add', async (c) => {
  const id = c.req.param('id')
  await service.addRestaurant(id)
  return c.json({ ok: true })
})

// DELETE /restaurants/:id
// Removes a restaurant from the user's my-list
app.delete('/restaurants/:id', async (c) => {
  const id = c.req.param('id')
  await service.removeRestaurant(id)
  return c.json({ ok: true })
})

// GET /restaurants/:id/menus/detail?date=YYYYMMDD&mealTimeId=xxx&hallNo=xxx&courseType=xxx
// Welstory only — returns per-component nutrition detail
app.get('/restaurants/:id/menus/detail', async (c) => {
  const id = c.req.param('id')
  const { date, mealTimeId, hallNo, courseType } = c.req.query()

  if (!date || !mealTimeId || !hallNo || !courseType) {
    return c.json(
      { error: 'Missing required query params: date, mealTimeId, hallNo, courseType' },
      400
    )
  }

  const detail = await service.getMenuDetail(id, date, mealTimeId, hallNo, courseType)
  return c.json(detail)
})

export default app
