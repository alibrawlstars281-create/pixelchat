const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const Database = require('better-sqlite3');
require('dotenv').config();

const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'pixelchat-secret-key-change-in-production';

const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT DEFAULT '',
    google_id TEXT UNIQUE,
    role TEXT DEFAULT 'user',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT DEFAULT 'Yeni Sohbet',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
`);

// existing db'lere kolon ekle
try { db.exec('ALTER TABLE users ADD COLUMN role TEXT DEFAULT \'user\''); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT \'\''); } catch {}

// OnePixel kurucu hesabı
const founder = db.prepare('SELECT id FROM users WHERE username = ?').get('OnePixel');
if (!founder) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('OnePixel', hash, 'admin');
  console.log('✓ OnePixel kurucu hesabı oluşturuldu (şifre: admin123)');
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Passport Google OAuth
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/api/auth/google/callback',
}, (accessToken, refreshToken, profile, done) => {
  try {
    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(profile.id);
    if (!user) {
      const baseName = profile.displayName || profile.emails?.[0]?.value?.split('@')[0] || `user_${profile.id.slice(0, 6)}`;
      let username = baseName;
      let counter = 1;
      while (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
        username = `${baseName}${counter++}`;
      }
      const result = db.prepare('INSERT INTO users (username, google_id, role) VALUES (?, ?, ?)').run(username, profile.id, 'user');
      user = { id: result.lastInsertRowid, username, role: 'user' };
    }
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

app.use(passport.initialize());

app.get('/api/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

app.get('/api/auth/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/?auth=failed' }),
  (req, res) => {
    const token = jwt.sign({ id: req.user.id, username: req.user.username, role: req.user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.redirect(`/?token=${token}&username=${encodeURIComponent(req.user.username)}&role=${req.user.role}`);
  }
);

const fs = require('fs');
const systemPrompt = fs.readFileSync(path.join(__dirname, 'system-prompt.txt'), 'utf8').trim();

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Giriş yapmalısınız.' });
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Geçersiz token.' });
  }
}

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password || username.length < 3 || password.length < 4) {
      return res.status(400).json({ error: 'Kullanıcı adı en az 3, şifre en az 4 karakter olmalı.' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış.' });

    const hash = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Kayıt başarısız.' });
  }
});

app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username, role: user.role });
  } catch {
    res.status(500).json({ error: 'Giriş başarısız.' });
  }
});

app.get('/api/conversations', authMiddleware, (req, res) => {
  const list = db.prepare(
    'SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(req.user.id);
  res.json(list);
});

app.post('/api/conversations', authMiddleware, (req, res) => {
  const { title } = req.body;
  const result = db.prepare('INSERT INTO conversations (user_id, title) VALUES (?, ?)').run(req.user.id, title || 'Yeni Sohbet');
  res.json({ id: result.lastInsertRowid });
});

app.get('/api/conversations/:id', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Sohbet bulunamadı.' });
  const messages = db.prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id').all(req.params.id);
  res.json({ conversation: conv, messages });
});

app.delete('/api/conversations/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

app.post('/api/chat', authMiddleware, async (req, res) => {
  try {
    const { conversationId, message, file } = req.body;
    if (!message && !file) return res.status(400).json({ error: 'Mesaj veya dosya gerekli.' });

    const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(conversationId, req.user.id);
    if (!conv) return res.status(404).json({ error: 'Sohbet bulunamadı.' });

    const historyRows = db.prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id').all(conversationId);
    const groqMessages = [{ role: 'system', content: systemPrompt }];
    for (const row of historyRows) {
      groqMessages.push({ role: row.role, content: row.content });
    }

    const hasFile = file && file.data && file.mime;
    const userContent = hasFile
      ? [{ type: 'text', text: message || 'Bu dosyayı açıkla.' },
         { type: 'image_url', image_url: { url: `data:${file.mime};base64,${file.data}` } }]
      : message;

    groqMessages.push({ role: 'user', content: userContent });

    const modelName = hasFile ? 'llama-3.2-11b-vision-preview' : 'llama-3.3-70b-versatile';

    const completion = await groq.chat.completions.create({
      model: modelName,
      messages: groqMessages,
      temperature: 0.7,
      max_tokens: 2048,
    });

    const reply = completion.choices[0]?.message?.content || 'Yanıt alınamadı.';

    const insert = db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)');
    const userText = hasFile && message ? `[Dosya: ${file.name || 'ek'}] ${message}` : (message || '[Dosya eklendi]');
    insert.run(conversationId, 'user', userText);
    insert.run(conversationId, 'assistant', reply);
    db.prepare('UPDATE conversations SET updated_at = datetime(\'now\'), title = CASE WHEN title = \'Yeni Sohbet\' THEN ? ELSE title END WHERE id = ?').run(userText.slice(0, 50), conversationId);

    res.json({ reply });
  } catch (error) {
    console.error('Groq API hatası:', error.message);
    const msg = error.message?.includes('429') || error.message?.includes('quota')
      ? 'API kotaları doldu.'
      : 'Bir hata oluştu. Lütfen tekrar deneyin.';
    res.status(500).json({ error: msg });
  }
});

app.get('/api/system-prompt', (req, res) => {
  res.json({ systemPrompt });
});

app.get('/api/system-prompt.txt', (req, res) => {
  res.type('text').send(systemPrompt);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', bot: 'PixelChat' });
});

app.listen(PORT, () => {
  console.log(`PixelChat sunucusu http://localhost:${PORT} adresinde çalışıyor.`);
});
