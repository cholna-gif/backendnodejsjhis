import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import profileRouter from './routes/profile';
import ridesRouter from './routes/rides';
import chatRouter from './routes/chat';
import supportRouter from './routes/support';
import favoritesRouter from './routes/favorites';
import driversRouter from './routes/drivers';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/profile', profileRouter);
app.use('/api/rides', ridesRouter);
app.use('/api/chat', chatRouter);
app.use('/api/support', supportRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/drivers', driversRouter);

app.use(errorHandler);

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Jih backend running on http://0.0.0.0:${PORT}`);
  console.log(`Reachable from devices on: http://192.168.110.208:${PORT}`);
});

export default app;
