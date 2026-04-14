import {
    SecretsManagerClient,
    GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { LoginResponse } from "../types/loginType";
const REGION = process.env.REGION;
const dynamoClient = new DynamoDBClient({
    region: REGION,
    credentials: process.env.USE_COGNITO === 'true'
        ? fromCognitoIdentityPool({
            identityPoolId: process.env.IDENTITY_POOL_ID!,
            clientConfig: { region: REGION },
        })
        : undefined,
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export async function loginToAAASWatch(imei: string): Promise<string> {
    try {
        const { username, password } = await getDeviceUsername(imei);
        console.log("username", username);
        console.log("password", password);
        const response = await fetch(`${process.env.AAASWatch_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: username,
                password: password,
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Login failed with status ${response.status}: ${errorText}`);
        }
        const loginData: LoginResponse = await response.json();


        return loginData.data.token;
    }
    catch (error) {
        console.error("Error logging in:", error);
        throw error;
    }
}

async function getDeviceUsername(imei: string) {
    const { group, userId } = await getDeviceGroup(imei);
    const secretKey = `wearable/${group ?? 'Taiwan'}/${userId}`;
    // For local development, we want to use the default credential provider (IAM)
    // instead of Cognito, which requires a logged-in user context.
    const client = new SecretsManagerClient({
        region: REGION,
        credentials: process.env.USE_COGNITO === 'true'
            ? fromCognitoIdentityPool({
                identityPoolId: process.env.IDENTITY_POOL_ID!,
                clientConfig: { region: REGION },
            })
            : undefined, // undefined falls back to default provider (IAM keys/roles)
    });
    const command = new GetSecretValueCommand({
        SecretId: secretKey,
    });
    const response = await client.send(command);
    if (!response.SecretString) {
        throw new Error("SecretString is empty");
    }
    const secret = JSON.parse(response.SecretString);
    return {
        username: secret.username,
        password: secret.password,
    };
}

async function getDeviceGroup(imei: string) {
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
