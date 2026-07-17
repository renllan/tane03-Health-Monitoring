import express from 'express';
import router from './router';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const app = express();
const useCognito = process.env.USE_COGNITO !== 'false';
const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID;
const cognitoClientId = process.env.COGNITO_CLIENT_ID;

if (useCognito && (!cognitoUserPoolId || !cognitoClientId)) {
  console.error('Missing required env vars: COGNITO_USER_POOL_ID and/or COGNITO_CLIENT_ID. Exiting.');
  process.exit(1);
}

// Configure the verifier with your Cognito details (only if enabled)
const verifier = useCognito
  ? CognitoJwtVerifier.create({
    userPoolId: cognitoUserPoolId!,
    tokenUse: 'id', // We expect the frontend to send the idToken
    clientId: cognitoClientId!,
  })
  : null;

// Authentication Middleware
const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // If Cognito auth is disabled, bypass authentication checks entirely
  if (!verifier) {
    console.warn('Cognito auth is DISABLED (USE_COGNITO=false) — skipping token verification');
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = await verifier.verify(token);
    // You can attach the payload to the request if you need to use user groups or email in your routes
    // (req as any).user = payload;
    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};



// Middleware to parse JSON bodies
app.use(express.json());

// Unprotected health check (used by benchmark preflight and load balancers)
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Main Router - Protected by requireAuth middleware
app.use('/api', requireAuth, router);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal Server Error';
  console.error(err.stack);
  res.status(status).json({ error: message });
});

export default app;
