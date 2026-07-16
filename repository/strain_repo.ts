const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
// Setup the DynamoDB Client
const client = new DynamoDBClient({ region: process.env.AP_NORTHEAST_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const getTableName = () => process.env.TANE03_STRAIN_TABLE || 'TanE03_Strain';


export const StrainRepo = {
    async getStrain(imei: string, date: string): Promise<any> {
        const command = new GetCommand({
            TableName: getTableName(),
            Key: {
                "IMEI": imei,
                "Date": date
            }
        });
        const response = await docClient.send(command);
        return response.Item;
    
    },

    async saveStrain(imei: string, date: string, strainData: number): Promise<any> {
        const command = new PutCommand({
            TableName: getTableName(),
            Item: {
                "IMEI": imei,
                "Date": date,
                "StrainData": strainData
            }
        });
        return await docClient.send(command);
    }


}
