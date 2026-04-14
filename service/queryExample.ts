import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.REGION || 'us-east-1';
const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Example 1: Querying by IMEI
 * Use this when IMEI is either the Partition Key or a Global Secondary Index (GSI).
 * Querying is much more efficient than Scanning.
 */
export async function queryByImei(imei: string) {
    const command = new QueryCommand({
        TableName: process.env.DEVICE_INFO_TABLE,
        // Optional: IndexName: "imei-index", // Use this if imei is a GSI and not the main Partition Key
        KeyConditionExpression: "imei = :imei",
        ExpressionAttributeValues: {
            ":imei": imei
        }
    });

    try {
        const { Items } = await docClient.send(command);
        return Items?.[0]; // Returns the first matching device
    } catch (error) {
        console.error("Query Error:", error);
        throw error;
    }
}

/**
 * Example 2: Getting by ID (Direct Lookup)
 * Use GetCommand when you have the exact Partition Key (and Sort Key if applicable).
 * This is the most efficient operation in DynamoDB.
 */
export async function getDeviceById(deviceId: string) {
    const command = new GetCommand({
        TableName: process.env.DEVICE_INFO_TABLE,
        Key: {
            id: deviceId // Replace 'id' with your actual Partition Key attribute name
        }
    });

    try {
        const { Item } = await docClient.send(command);
        return Item;
    } catch (error) {
        console.error("Get Error:", error);
        throw error;
    }
}
