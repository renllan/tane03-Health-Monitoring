import { DailyEvaluationRecord } from "../types/evaluationType";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: process.env.AP_NORTHEAST_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DAILY_EVALUATION_TABLE;

export const EvaluationRepo = {
    /**
     * Retrieves the daily evaluation record for a specific device and date.
     * Returns undefined if no record exists.
     */
    async getEvaluation(imei: string, date: string): Promise<DailyEvaluationRecord | undefined> {
        const command = new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                imei,
                date,
            },
        });
        const response = await docClient.send(command);
        return response.Item as DailyEvaluationRecord | undefined;
    },

    /**
     * Saves (upserts) the full daily evaluation result for a device and date.
     * Overwrites any existing record for the same imei + date.
     */
    async saveEvaluation(record: DailyEvaluationRecord): Promise<void> {
        const command = new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                ...record,
                lastUpdated: new Date().toISOString(),
            },
        });
        await docClient.send(command);
    },
};
