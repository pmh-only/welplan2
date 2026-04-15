import { serve } from '@hono/node-server'
import app from './server.js'

const port = Number(process.env.PORT ?? 3000)

serve({ fetch: app.fetch, port }, () => {
  console.log(`API server running on http://localhost:${port}`)
})
