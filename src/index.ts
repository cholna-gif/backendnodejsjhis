import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import profileRouter from './routes/profile';
import ridesRouter from './routes/rides';
import chatRouter from './routes/chat';
import supportRouter from './routes/support';
import favoritesRouter from './routes/favorites';
import driversRouter from './routes/drivers';
import driverProfileRouter from './routes/driver-profile';
import driverRidesRouter from './routes/driver-rides';
import driverEarningsRouter from './routes/driver-earnings';
import driverAuthRouter from './routes/driver-auth';
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

// ── Driver mobile app routes ──────────────────────────────────────────────────
app.use('/api/driver/profile',  driverProfileRouter);
app.use('/api/driver/rides',    driverRidesRouter);
app.use('/api/driver/earnings', driverEarningsRouter);
app.use('/api/driver/auth',     driverAuthRouter);

app.use(errorHandler);

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Jih backend running on port ${PORT}`);
});

export default app;
