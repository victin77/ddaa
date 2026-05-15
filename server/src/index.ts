import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

import './db';
import authRoutes from './routes/auth';
import publicRoutes from './routes/public';
import consultantRoutes from './routes/consultants';
import salesRoutes from './routes/sales';
import metricsRoutes from './routes/metrics';
import excelRoutes from './routes/excel';
import adminRoutes from './routes/admin';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(
  cors({
    origin: (origin, cb) => cb(null, origin || true),
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/consultants', consultantRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', metricsRoutes);
app.use('/api', excelRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api', (req, res) => {
  res.status(404).json({ error: `api route not found: ${req.method} ${req.originalUrl}` });
});

const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`[racon] api on http://localhost:${PORT}`);
});
