import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
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
        return docClient.send(command);
    }
};