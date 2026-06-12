// Local dev server. Mirrors worker.js: static assets + /api/config.
require('dotenv').config({ path: '.env.local' });
const express = require('express');
const path = require('path');

const app = express();

app.get('/api/config', (_req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
  });
});

app.use(express.static(__dirname, { extensions: ['html'] }));
app.use((_req, res) => res.status(404).sendFile(path.join(__dirname, 'index.html')));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Folio dev server → http://localhost:${port}`));
