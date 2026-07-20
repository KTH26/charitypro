const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

const db = new sqlite3.Database('database.sqlite', (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    console.log('Database connected.');
    db.run(`CREATE TABLE IF NOT EXISTS store (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT,
      action TEXT,
      payload TEXT
    )`);
  }
});

app.get('/api/sync', (req, res) => {
  db.get('SELECT value FROM store ORDER BY id DESC LIMIT 1', [], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (row) {
      res.json({ value: row.value });
    } else {
      res.json({ value: null });
    }
  });
});

app.post('/api/sync', (req, res) => {
  const { value } = req.body;
  if (!value) return res.status(400).json({ error: 'value is required' });
  
  // Clean up old store state to prevent DB bloating since we only need the latest
  db.run('DELETE FROM store', [], (err) => {
    db.run('INSERT INTO store (value) VALUES (?)', [value], function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ success: true, id: this.lastID });
    });
  });
});

app.get('/api/events', (req, res) => {
  const since = parseInt(req.query.since) || 0;
  db.all('SELECT * FROM events WHERE id > ? ORDER BY id ASC', [since], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, events: rows });
  });
});

app.post('/api/events', (req, res) => {
  const { clientId, action, payload } = req.body;
  if (!clientId || !action) return res.status(400).json({ error: 'clientId and action are required' });
  
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  
  db.run('INSERT INTO events (client_id, action, payload) VALUES (?, ?, ?)', [clientId, action, payloadStr], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, id: this.lastID });
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
