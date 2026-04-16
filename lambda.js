require('dotenv').config();

const serverlessExpress = require('@vendia/serverless-express');
const app = require('./dist/app').default;

// Wrap Express app as a Lambda handler
exports.handler = serverlessExpress({ app });
