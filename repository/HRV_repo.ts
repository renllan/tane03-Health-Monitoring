const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
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
        return response.item;
        //return response.Item;
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
        return true
        //return docClient.send(command);
    },

    async queryHRV(imei: string, startDate: string, endDate: string) {
        // Convert YYYY-MM-DD to UNIX timestamp in seconds
        const startTs = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000);
        const endTs = Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000);

        const queryForType = async (type: string) => {
            const command = new QueryCommand({
                TableName: process.env.TanE03_HRV_Table,
                KeyConditionExpression: "imei = :imei AND #sk BETWEEN :startSk AND :endSk",
                ExpressionAttributeNames: {
                    "#sk": "type#timestamp"
                },
                ExpressionAttributeValues: {
                    ":imei": imei,
                    ":startSk": `${type}#${startTs}`,
                    ":endSk": `${type}#${endTs}`
                }
            });
            const response = await docClient.send(command);
            return response.Items || [];
        };

        const [rmssdItems, sdnnItems] = await Promise.all([
            queryForType("RMSSD"),
            queryForType("SDNN")
        ]);

        const allItems = [...rmssdItems, ...sdnnItems];

        // Map to what calculateBaselines expects: { date, rmssd?, sdnn? }
        return allItems.map(item => {
            // Convert timestamp (seconds) back to YYYY-MM-DD for grouping
            const dateStr = new Date(Number(item.timestamp) * 1000).toISOString().split("T")[0];
            return {
                date: dateStr,
                rmssd: item.type === "RMSSD" ? item.value : undefined,
                sdnn: item.type === "SDNN" ? item.value : undefined
            };
        });
    }
}