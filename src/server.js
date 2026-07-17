import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import studentRoutes from './routes/student.routes.js';
import lookupRoutes from './routes/lookup.routes.js';
import resultRoutes from './routes/result.routes.js';
import parentRoutes from './routes/parent.routes.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { connectDb, getDbConnectionError, isDbConnected } from './config/db.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// CORS middleware MUST be before helmet
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Max-Age', '3600');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Apply cors package
app.use(cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Helmet AFTER CORS so it doesn't override headers
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
// Public API health check (no auth required) — useful for frontend probes and uptime checks
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', (_req, res, next) => {
  if (isDbConnected()) {
    next();
    return;
  }

  const detail = getDbConnectionError()?.message;
  res.status(503).json({
    message: detail
      ? `Database unavailable: ${detail}`
      : 'Database unavailable. Set MONGODB_URI in backend/.env or start local MongoDB.'
  });
});
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/students', studentRoutes);
app.use('/api', lookupRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/parent', parentRoutes);
app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT || 5001);
let reconnectTimer = null;

async function connectWithRetry() {
  try {
    await connectDb();
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
  } catch (error) {
    console.error(error.message);
    if (!reconnectTimer) {
      reconnectTimer = setInterval(() => {
        if (!isDbConnected()) {
          connectWithRetry();
        }
      }, 10000);
    }
  }
}

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

connectWithRetry();

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the other process or start with PORT=<free-port>.`);
    process.exit(1);
  }

  throw error;
});
