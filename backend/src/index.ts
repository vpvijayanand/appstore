import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import authRouter from './routes/auth';
import catalogRouter from './routes/catalog';
import appsRouter from './routes/apps';
import eventsRouter from './routes/events';
import analyticsRouter from './routes/analytics';
import customersRouter from './routes/customers';
import terminalsRouter from './routes/terminals';
import categoriesRouter from './routes/categories';
import terminalMastersRouter from './routes/terminal-masters';
import assignmentsRouter from './routes/assignments';
import { initMinIO } from './services/minio';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust the nginx reverse proxy (single hop) so express-rate-limit and req.ip
// correctly read X-Forwarded-For instead of throwing/misidentifying clients.
app.set('trust proxy', 1);

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Terminal-Key'],
}));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '200'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// ── Request Parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'WL BizStore API', timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/catalog', catalogRouter);       // Terminal-facing
app.use('/api/apps', appsRouter);             // Admin-facing
app.use('/api/events', eventsRouter);         // Terminal-facing (telemetry)
app.use('/api/analytics', analyticsRouter);   // Admin-facing
app.use('/api/customers', customersRouter);   // Admin-facing
app.use('/api/terminals', terminalsRouter);   // Admin-facing
app.use('/api/categories', categoriesRouter); // Admin-facing
app.use('/api/terminal-masters', terminalMastersRouter); // Admin-facing (Serial No / TID device master)
app.use('/api/assignments', assignmentsRouter);          // Admin-facing (App <-> Customer/Terminal assignment)

// ── 404 & Error Handler ───────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
initMinIO()
  .catch((err) => {
    console.error('[MinIO] Bucket initialization failed (uploads/downloads will not work until this is fixed):', err);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`🚀 WL BizStore API running on port ${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/health`);
    });
  });

export default app;
