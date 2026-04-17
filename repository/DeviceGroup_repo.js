const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: process.env.REGION });
const docClient = DynamoDBDocumentClient.from(client);

// It's recommended to standardize your table name
const TABLE_NAME = process.env.HEALTH_DATA_TABLE;

export const DeviceGroupRepo = {
    async getDeviceGroup(imei) {
        const response = await docClient.send(
            new GetCommand({
                TableName: process.env.DEVICE_INFO_TABLE,
                Key: {
                    id: imei, // Look up directly by the 'id' attribute
                },
            })
        );

        if (!response.Item) {
            throw new Error(`Device with IMEI ${imei} not found`);
        }

        const item = response.Item;
        return {
            group: item.group,
            userId: item.userId,
        };
    }
};
