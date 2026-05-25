import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { HRVData } from "../types/HRVType";

// Setup the DynamoDB Client
const client = new DynamoDBClient({ region: process.env.AP_NORTHEAST_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const getTableName = () => process.env.TANE03_HRV_TABLE || 'TanE03_HRV_Table';

export const HRV_repo = {
    /**
     * Retrieves cached HRVData from the database by imei, date, and HRVType.
     */
    async getHRV(imei: string, date: string, type: string): Promise<HRVData | null> {
        const command = new GetCommand({
            TableName: getTableName(),
            Key: {
                "imei": imei,
                "type#timestamp": `${type}#${date}`
            },
        });
        const response = await docClient.send(command);
        if (!response.Item) return null;
        return response.Item as HRVData;
    },

    /**
     * Saves calculated HRVData into the DynamoDB cache.
     */
    async saveHRV(data: HRVData): Promise<any> {
        const command = new PutCommand({
            TableName: getTableName(),
            Item: {
                "imei": data.imei,
                "type#timestamp": `${data.type}#${data.timestamp}`,
                "values": data.values,
                "type": data.type,
                "timestamp": data.timestamp
            }
        });
        //return docClient.send(command);
    },

    /**
     * Bulk-fetches all HRV records for an imei+type within a date range.
     * Returns a map of date → HRVData (or null for missing days).
     * Used during baseline calculation to replace 60 individual GetItem calls
     * with a single Query, reducing DynamoDB reads by ~98%.
     *
     * The sort key is stored as "TYPE#YYYY-MM-DD", so we use BETWEEN to
     * match the prefix "TYPE#startDate" to "TYPE#endDate" inclusive.
     */
    async queryHRVRange(
        imei: string,
        type: string,
        startDate: string,
        endDate: string
    ): Promise<Record<string, HRVData | null>> {
        const command = new QueryCommand({
            TableName: getTableName(),
            KeyConditionExpression:
                "imei = :imei AND #sk BETWEEN :start AND :end",
            ExpressionAttributeNames: { "#sk": "type#timestamp" },
            ExpressionAttributeValues: {
                ":imei": imei,
                ":start": `${type}#${startDate}`,
                ":end":   `${type}#${endDate}`,
            },
        });
        const response = await docClient.send(command);
        const map: Record<string, HRVData | null> = {};
        for (const item of response.Items || []) {
            // sort key format is "TYPE#YYYY-MM-DD" — extract just the date
            const date = (item["type#timestamp"] as string).split("#")[1];
            map[date] = item as HRVData;
        }
        return map;
    },
};