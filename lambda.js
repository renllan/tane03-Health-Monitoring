require('dotenv').config();

const serverlessExpress = require('@vendia/serverless-express');
const app = require('./app').default || require('./app');
// Import the EvaluationService
const { EvaluationService } = require('./service/evaluationService');

const _handler = serverlessExpress({ app });

// callbackWaitsForEmptyEventLoop=false lets Lambda return the HTTP response
// immediately without waiting for fire-and-forget promises (e.g. notifications) to settle.
exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    // 1. Intercept direct invocations from the EventBridge Scheduler
    if (event.source === 'scheduler' && event.action === 'evaluateDay') {
        const { imei } = event;
        console.log(`[Scheduler] Direct invocation for IMEI: ${imei}`);

        try {
            await Promise.all([
                EvaluationService.evaluateDayLevelSleepScore(imei),
                EvaluationService.evaluateDayLevelSleepDuration(imei),
                EvaluationService.evaluateDayLevelRHR(imei),
                EvaluationService.evaluateDayLevelHRV(imei),
                EvaluationService.evaluateDayLevelSleepHeartRate(imei)
            ]);
            return { statusCode: 200, body: "Scheduled evaluation completed successfully" };
        } catch (error) {
            console.error("[Scheduler] Error during scheduled evaluation:", error);
            return { statusCode: 500, body: error.message };
        }
    }

    // 2. Otherwise, route standard API Gateway HTTP requests through Express
    return await _handler(event, context);
};
