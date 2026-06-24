import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

const app = new Hono<{ Bindings: { DB: D1Database } }>().basePath('/api')

app.get('/sync', async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT data FROM store WHERE id = 1').first()
    return c.json({ value: result?.data || null })
  } catch (e) {
    return c.json({ value: null })
  }
})

app.post('/sync', async (c) => {
  const { value } = await c.req.json()
  await c.env.DB.prepare(
    'INSERT INTO store (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'
  ).bind(value).run()
  return c.json({ success: true })
})

export const onRequest = handle(app)
