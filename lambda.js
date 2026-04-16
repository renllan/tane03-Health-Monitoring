require('dotenv').config();
require('ts-node/register');

const serverlessExpress = require('@vendia/serverless-express');
const app = require('./app').default;

// Wrap Express app as a Lambda handler
exports.handler = serverlessExpress({ app });
