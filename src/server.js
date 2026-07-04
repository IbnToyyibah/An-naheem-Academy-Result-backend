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

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const allowedOrigins = new Set([
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
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

const port = Number(process.env.PORT || 5000);
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
