import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import veiculosRouter from './routes/veiculos.js';
import leadsRouter from './routes/leads.js';
import financeiroRouter from './routes/financeiro.js';
import placasRouter from './routes/placas.js';
import alertasRouter from './routes/alertas.js';
import configRouter from './routes/config.js';
import whatsappWebhook from './webhooks/whatsapp.js';
import telegramWebhook from './webhooks/telegram.js';
import { iniciarCronResumoSemanal } from './services/resumoSemanal.js';
import { initPolling } from './services/telegramClient.js';

const app = express();

// ── Segurança ──────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// ── Rate limiting ──────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});
app.use('/api', limiter);

// ── Body parsing ───────────────────────────────────────────
// Webhooks precisam do body raw para validar HMAC
app.use('/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json());

// ── Rotas API ──────────────────────────────────────────────
app.use('/api/veiculos', veiculosRouter);
app.use('/api/leads',    leadsRouter);
app.use('/api/financeiro', financeiroRouter);
app.use('/api/placas',   placasRouter);
app.use('/api/alertas',  alertasRouter);
app.use('/api/config',   configRouter);

// ── Webhooks ───────────────────────────────────────────────
app.use('/webhooks/whatsapp', whatsappWebhook);
app.use('/webhooks/telegram', telegramWebhook);

// ── Health check ───────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── 404 ────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// ── Error handler global ───────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const isDev = process.env.NODE_ENV !== 'production';
  console.error('[Error]', err);
  res.status(err.status || 500).json({
    error: isDev ? err.message : 'Erro interno do servidor',
  });
});

// ── Start ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT} [${process.env.NODE_ENV}]`);
  iniciarCronResumoSemanal();
  initPolling().catch(err => console.error('[initPolling]', err));
});

export default app;
