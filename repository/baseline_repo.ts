import { BaselineData } from "../types/baselineType";
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
// Setup the DynamoDB Client
const client = new DynamoDBClient({ region: process.env.AP_NORTHEAST_REGION });
const docClient = DynamoDBDocumentClient.from(client);


const PRIMARY_KEY = "imei#type"
const table_name = process.env.HEALTH_DATA_BASELINE_TABLE

//get the baseline data from the repo
export const BaselineRepo = {
    async getBaseline(imei: string, type: string) {
        const command = new GetCommand({
            TableName: table_name,
            Key: {
                [PRIMARY_KEY]: `${imei}#${type}`
            }
        });
        const response = await docClient.send(command);
        return response.Item;
    },
//save the baseline data to the repo
    async saveBaseline(data: BaselineData) {
        const command = new PutCommand({
            TableName: table_name,
            Item: {
                [PRIMARY_KEY]: `${data.imei}#${data.type}`,
                "baselineValue": data.baselineValue,
                "lastUpdated": new Date().toISOString(),
                "type": data.type
            }
        });
        return await docClient.send(command);
    }
}
