import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SleepData } from "../types/sleepDataType";

// Setup the DynamoDB Client
const client = new DynamoDBClient({ region: process.env.AP_NORTHEAST_REGION });
const docClient = DynamoDBDocumentClient.from(client);

// Table: TanE_03_SleepAnalytics
// HASH key:  imei (S)
// RANGE key: date (S) — format: "YYYY-MM-DD"

const getTableName = () => process.env.TANE03_SLEEP_TABLE || 'TanE03_SleepAnalytics';

// Map raw DynamoDB item → SleepData type (deserializes segments string → object)
function mapToSleepData(item: Record<string, any>): SleepData {
    return {
        imei: item.imei,
        date: item.date,
        minutes: item.minutes,
        sleepScore: item.sleepScore,
        segments: typeof item.segments === "string" ? JSON.parse(item.segments) : item.segments,
        avgHR: item.avgHR,
        minHR: item.minHR,
        rmssd: item.rmssd,
        rhr: item.rhr,
        rhrTime: item.rhrTime,
        wakeUps: item.wakeUps,
    };
}

export const SleepRepo = {

    // Fetch a single night's sleep record by exact date
    async getSleepData(deviceId: string, date: string): Promise<SleepData | null> {
        const command = new GetCommand({
            TableName: getTableName(),
            Key: {
                imei: deviceId,
                date   // "YYYY-MM-DD"
            }
        });
        const response = await docClient.send(command);
        if (!response.Item) return null;
        return mapToSleepData(response.Item);
    },
    async querySleepAvgHeartrate(deviceID: string, startDate: string, endDate: string) {
        const command = new QueryCommand({
            TableName: getTableName(),
            KeyConditionExpression: "imei = :imei AND #date BETWEEN :startDate AND :endDate",
            ExpressionAttributeNames: {
                "#date": "date"   // alias because "date" is a DynamoDB reserved word!
            },
            ExpressionAttributeValues: {
                ":imei": deviceID,
                ":startDate": startDate,    // "YYYY-MM-DD"
                ":endDate": endDate         // "YYYY-MM-DD"
            },
            ScanIndexForward: true,         // Ascending date order (oldest → newest)
            ProjectionExpression: "imei, #date, avgHR"
        });
        const response = await docClient.send(command);
        return (response.Items || []).map(item => ({
            imei: item.imei,
            date: item.date,
            avgHR: item.avgHR,
        }));
    },
    async queryRHR(deviceID: string, startDate: string, endDate: string): Promise<{ imei: string; date: string; rhr: number }[]> {
        const command = new QueryCommand({
            TableName: getTableName(),
            KeyConditionExpression: "imei = :imei AND #date BETWEEN :startDate AND :endDate",
            ExpressionAttributeNames: {
                "#date": "date"   // alias because "date" is a DynamoDB reserved word!
            },
            ExpressionAttributeValues: {
                ":imei": deviceID,
                ":startDate": startDate,    // "YYYY-MM-DD"
                ":endDate": endDate         // "YYYY-MM-DD"
            },
            ScanIndexForward: true,         // Ascending date order (oldest → newest)
            ProjectionExpression: "imei, #date, rhr"
        });
        const response = await docClient.send(command);
        return (response.Items || []).map(item => ({
            imei: item.imei,
            date: item.date,
            rhr: item.rhr,
        }));
    },
    // Fetch sleep records over a date range (e.g. last 28 days for baseline)
    async querySleepData(deviceId: string, startDate: string, endDate: string): Promise<SleepData[]> {
        const command = new QueryCommand({
            TableName: getTableName(),
            KeyConditionExpression: "imei = :imei AND #date BETWEEN :startDate AND :endDate",
            ExpressionAttributeNames: {
                "#date": "date"   // alias because "date" is a DynamoDB reserved word!
            },
            ExpressionAttributeValues: {
                ":imei": deviceId,
                ":startDate": startDate,    // "YYYY-MM-DD"
                ":endDate": endDate         // "YYYY-MM-DD"
            },
            ScanIndexForward: true,          // Ascending date order (oldest → newest)
        });
        const response = await docClient.send(command);
        return (response.Items || []).map(mapToSleepData);
    },


    async querySleepSegments(deviceID: String, startDate: string, endDate: string) {
        const command = new QueryCommand({
            TableName: getTableName(),
            KeyConditionExpression: "imei = :imei AND #date BETWEEN :startDate AND :endDate",
            ExpressionAttributeNames: {
                "#date": "date"   // alias because "date" is a DynamoDB reserved word!
            },
            ExpressionAttributeValues: {
                ":imei": deviceID,
                ":startDate": startDate,    // "YYYY-MM-DD"
                ":endDate": endDate         // "YYYY-MM-DD"
            },
            ScanIndexForward: true,
            ProjectionExpression: "imei, #date, segments"
        });
        const response = await docClient.send(command);
        return (response.Items || []).map(item => ({
            imei: item.imei,
            date: item.date,
            segments: item.segments,
        }));
    },


    async saveSleep(data: SleepData): Promise<void> {
        const command = new PutCommand({
            TableName: getTableName(),
            Item: {
                imei: data.imei,
                date: data.date,
                minutes: data.minutes,
                sleepScore: data.sleepScore,
                segments: JSON.stringify(data.segments),  // serialize array → string for DynamoDB
                avgHR: data.avgHR,
                minHR: data.minHR,
                rmssd: data.rmssd,
                rhr: data.rhr,
                rhrTime: data.rhrTime,
                wakeUps: data.wakeUps,
                updatedAt: new Date().toISOString()
            }
        });
        await docClient.send(command);
    }
};
