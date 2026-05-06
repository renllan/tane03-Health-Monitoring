require('dotenv').config();

const serverlessExpress = require('@vendia/serverless-express');
const app = require('./app').default || require('./app');
// Import the EvaluationController
const { evaluationController } = require('./controller/evaluationController');

const _handler = serverlessExpress({ app });

// callbackWaitsForEmptyEventLoop=false lets Lambda return the HTTP response
// immediately without waiting for fire-and-forget promises (e.g. notifications) to settle.
exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    // 1. Intercept direct invocations from the EventBridge Scheduler
    if (event.source === 'scheduler' && event.action === 'evaluateDay') {
        const { imei } = event;
        console.log(`[Scheduler] Direct invocation for IMEI: ${imei}`);

        // Mock the Express req and res objects since the controller expects them
        const req = { params: { imei } };
        let responseBody = null;
        let responseStatus = 200;
        
        const res = {
            status: function(code) {
                responseStatus = code;
                return this;
            },
            json: function(body) {
                responseBody = body;
                return this;
            }
        };

        try {
            // Call the controller directly
            await evaluationController.evaluateDay(req, res);
            
            // This prints the final results clearly into your CloudWatch Logs!
            console.log(`[Scheduler] Evaluation Results for IMEI ${imei}:`, JSON.stringify(responseBody, null, 2));

            return { 
                statusCode: responseStatus, 
                body: JSON.stringify(responseBody) 
            };
        } catch (error) {
            console.error("[Scheduler] Error during scheduled evaluation:", error);
            return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        }
    }

    // 2. Otherwise, route standard API Gateway HTTP requests through Express
    return await _handler(event, context);
};
