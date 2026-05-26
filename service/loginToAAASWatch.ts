import {
    SecretsManagerClient,
    GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import { LoginResponse } from "../types/loginType";
import { DeviceGroupRepo } from "../repository/DeviceGroup_repo";

const tokenCache: Record<string, { token: string; expiry: number }> = {};

export async function loginToAAASWatch(imei: string): Promise<string> {
    // Check cache (assume token is valid for 1 hour, we cache for 50 mins)
    const cached = tokenCache[imei];
    if (cached && cached.expiry > Date.now()) {
        return cached.token;
    }

    try {
        const { username, password } = await getDeviceUsername(imei);
        const response = await fetch(`${process.env.AAASWatch_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: username, password }),
        });
        console.log("Login response:", response);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Login failed with status ${response.status}: ${errorText}`);
        }

        const loginData: LoginResponse = await response.json();
        const token = loginData.data.token;

        // Cache the token for 50 minutes (3000000 ms)
        tokenCache[imei] = {
            token,
            expiry: Date.now() + 50 * 60 * 1000
        };

        return token;
    } catch (error) {
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
        region: process.env.US_REGION,
        credentials: process.env.USE_COGNITO === 'true'
            ? fromCognitoIdentityPool({
                identityPoolId: process.env.IDENTITY_POOL_ID!,
                clientConfig: { region: process.env.US_REGION },
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
    console.log("secret:", secret);
    return {
        username: secret.username,
        password: secret.password,
    };
}

async function getDeviceGroup(imei: string) {
    const { group, userId } = await DeviceGroupRepo.getDeviceGroup(imei);
    if (!group || !userId) {
        throw new Error(`Device with IMEI ${imei} not found`);
    }
    return {
        group: group,
        userId: userId,
    };
}
