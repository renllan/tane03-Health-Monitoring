const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
// Setup the DynamoDB Client
const client = new DynamoDBClient({ region: process.env.AP_NORTHEAST_REGION });
const docClient = DynamoDBDocumentClient.from(client);
import { HRVData } from "../types/HRVType";


export const HRV_repo = {
    async getLastHourData(imei: string, timestamp: string, type: string) {
        //round to the nearest hour
        const roundedTimestamp = Math.floor(Number(timestamp) / 3600) * 3600;
        const command = new GetCommand({
            TableName: process.env.TanE03_HRV_Table,
            Key: {
                "imei": imei,
                "type#timestamp": `${type}#${roundedTimestamp}`
            },
        });
        const response = await docClient.send(command);
        return response.Item;
    },

    async saveHRV(data: HRVData) {
        const command = new PutCommand({
            TableName: process.env.TanE03_HRV_Table,
            Item: {
                "imei": data.imei,
                "type#timestamp": `${data.type}#${data.timestamp}`, // <--- The composite key!
                "value": data.value,
                "type": data.type,
                "timestamp": data.timestamp, // Keep the unrounded timestamp as bonus metadata
            }
        });
        return docClient.send(command);
    }
}