const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
// Setup the DynamoDB Client
const client = new DynamoDBClient({ region: process.env.US_REGION });
const docClient = DynamoDBDocumentClient.from(client);

export const HeartRateRepo = {
    // 1. Sample last 28 days by imei of heart rate data
    async getLast28DaysData(imei) {
        const twentyEightDaysAgo = new Date();
        twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

        const response = await docClient.send(
            new QueryCommand({
                TableName: process.env.HEALTH_DATA_TABLE,
                // Assuming 'deviceId' is your primary partition key
                // and 'type#timestamp' is your sort key (e.g. 'heartRate#2025-08-17...')
                KeyConditionExpression: "deviceId = :deviceId AND #typeTime >= :startDate",
                ExpressionAttributeNames: {
                    "#typeTime": "type#timestamp"
                },
                ExpressionAttributeValues: {
                    ":deviceId": imei,
                    // Prepend the type so it correctly hits the sort key
                    ":startDate": `heartrate#${twentyEightDaysAgo.toISOString()}`,
                }
            })
        );
        return response.Items || [];
    },

    // 2. Check whether there exist a data older than 28 days
    async hasDataOlderThan28Days(imei) {
        const twentyEightDaysAgo = new Date();
        twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

        const response = await docClient.send(
            new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: "deviceId = :deviceId AND #typeTime <= :targetDate",
                ExpressionAttributeNames: {
                    "#typeTime": "type#timestamp"
                },
                ExpressionAttributeValues: {
                    ":deviceId": imei,
                    // Appending the time to the type guarantees we check only heartrate
                    ":targetDate": `heartrate#${twentyEightDaysAgo.toISOString()}`,
                    // Note: If you want to only check if it starts with 'heartrate', 
                    // we add this boundary filter because DynamoDB string compares characters directly
                    ":startBound": `heartrate#1970-01-01T00:00:00.000Z`
                },
                // Refine query to ensure it only grabs 'heartrate' and doesn't accidentally grab 'temperature' 
                // if it happens to be alphabetically before 'heartrate#'
                KeyConditionExpression: "deviceId = :deviceId AND #typeTime BETWEEN :startBound AND :targetDate",
                Limit: 1
            })
        );

        return response.Items && response.Items.length > 0;
    },

    // 3. Sample heartrate data for the last 24 hours
    async getLast24HoursData(imei) {
        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

        const response = await docClient.send(
            new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: "deviceId = :deviceId AND #typeTime >= :startDate",
                ExpressionAttributeNames: {
                    "#typeTime": "type#timestamp"
                },
                ExpressionAttributeValues: {
                    ":deviceId": imei,
                    ":startDate": `heartrate#${twentyFourHoursAgo.toISOString()}`,
                }
            })
        );
        return response.Items || [];
    },

    //return heartrate data for the last hour given timestamp
    async getLastHourData(imei, timestamp) {
        const thirtyMinutesAgo = new Date(timestamp);
        thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);

        const thirtyMinutesLater = new Date(timestamp);
        thirtyMinutesLater.setMinutes(thirtyMinutesLater.getMinutes() + 30);

        const response = await docClient.send(
            new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: "deviceId = :deviceId AND #typeTime BETWEEN :startDate AND :endDate",
                ExpressionAttributeNames: {
                    "#typeTime": "type#timestamp"
                },
                ExpressionAttributeValues: {
                    ":deviceId": imei,
                    ":startDate": `heartrate#${thirtyMinutesAgo.toISOString()}`,
                    ":endDate": `heartrate#${thirtyMinutesLater.toISOString()}`,
                }
            })
        );
        return response.Items || [];
    }
};
