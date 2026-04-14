import configureApp from '@vendia/serverless-express';
import app from './app';

// The serverless-express library takes your Express app and 
// returns a standard Lambda handler function.
export const handler = configureApp({ app });
