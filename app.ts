import express from 'express';
import router from './router';

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Main Router
app.use('/api', router);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

export default app;
