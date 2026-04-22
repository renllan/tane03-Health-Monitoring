import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { BaselineData, BaselineType } from "../types/baselineType";

// Setup the DynamoDB Client
const client = new DynamoDBClient({ region: process.env.AP_NORTHEAST_REGION });
const docClient = DynamoDBDocumentClient.from(client);

// Centralize the exact attribute name so it isn't hardcoded across the repo
const PRIMARY_KEY = "imei#type";

export const HealthDataBaselineRepo = {

    // Helper to keep the key formatting strictly consistent
    _formatKey(imei: string, type: string) {
        return `${imei}#${type}`;
    },

    async getBaseline(imei: string, type: BaselineType) {
        const command = new GetCommand({
            TableName: process.env.HEALTH_DATA_BASELINE_TABLE,
            Key: {
                [PRIMARY_KEY]: this._formatKey(imei, type)
            }
        });
        const response = await docClient.send(command);
        return response.Item;
    },

    async saveBaseline(data: BaselineData) {
        // UpdateCommand natively functions as an "Upsert" (Insert OR Update)!
        // This eliminates the need to run an expensive `getBaseline` check beforehand.
        const command = new UpdateCommand({
            TableName: process.env.HEALTH_DATA_BASELINE_TABLE,
            Key: {
                [PRIMARY_KEY]: this._formatKey(data.imei, data.type)
            },
            UpdateExpression: "SET baselineValue = :baselineValue, lastUpdated = :lastUpdated, type = :type",
            ExpressionAttributeValues: {
                ":baselineValue": data.baselineValue,
                ":lastUpdated": new Date().toISOString(),
                ":type": data.type
            },
            ReturnValues: "ALL_NEW"
        });

        await docClient.send(command);
    }
}