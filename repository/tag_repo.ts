import { DeviceTag, parseHexColor } from "../types/tagType";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";

// Initialize the DynamoDB Client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TanE03_DeviceTags || 'TanE03-DeviceTags';
const INDEX_NAME = "TagToImeiIndex";

/**
 * 1. getTagsByImei
 * Fetches all tags associated with a specific IMEI.
 * Queries the main table using the partition key (imei).
 */
export const TagRepo = {

  async getTagsByImei(imei: string): Promise<DeviceTag[]> {
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "imei = :imei",
      ExpressionAttributeValues: {
        ":imei": imei,
      },
    });

    const response = await docClient.send(command);
    return (response.Items as DeviceTag[]) || [];
  },

  /**
   * 2. queryByTag
   * Fetches all device tags (and their corresponding IMEIs) that match a specific tag.
   * Queries the Global Secondary Index (GSI).
   */
  async queryByTag(tag: string): Promise<DeviceTag[]> {
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: INDEX_NAME,
      KeyConditionExpression: "tag = :tag",
      ExpressionAttributeValues: {
        ":tag": tag,
      },
    });

    const response = await docClient.send(command);
    return (response.Items as DeviceTag[]) || [];
  },

  /**
   * 3. addEntry
   * Adds/binds a tag to a device (IMEI) along with an optional color.
   */
  async addEntry(imei: string, tag: string, color: string, groupId: string): Promise<void> {
    const validatedColor = parseHexColor(color);
    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        imei,
        tag,
        color: validatedColor,
        groupId,
      },
    });

    await docClient.send(command);
  },

  /**
   * 4. deleteTag
   * Deletes a tag completely from the database (removing it from all devices).
   * Queries the GSI to find all entries for the tag, then deletes them from the main table.
   */
  async deleteTag(tag: string): Promise<void> {
    const entries = await TagRepo.queryByTag(tag);

    // DynamoDB requires the primary key (both imei and tag) to delete an item
    for (const entry of entries) {
      const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          imei: entry.imei,
          tag: entry.tag,
        },
      });
      await docClient.send(command);
    }
  },

  /**
   * 5. deleteTagFromDevice (delete tag from user/device)
   * Removes a specific tag from a specific device (IMEI).
   */
  async deleteTagFromDevice(imei: string, tag: string): Promise<void> {
    const command = new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        imei,
        tag,
      },
    });

    await docClient.send(command);
  },

  async getTagColor(tag: string): Promise<string> {
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "tag = :tag",
      IndexName: INDEX_NAME,
      ExpressionAttributeValues: {
        ":tag": tag,
      },
    });
    const response = await docClient.send(command);
    const items = (response.Items as DeviceTag[]) || [];
    return items.length > 0 ? items[0].color : parseHexColor("#E3F2FD"); // return the color of the first entry
  },
  //get all entry by groupID
  async getByGroupId(groupId: string): Promise<DeviceTag[]> {
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "byGroupId",              // ← add this
      KeyConditionExpression: "groupId = :gid",  // ← camelCase
      ExpressionAttributeValues: {
        ":gid": groupId,
      },
    });
    const response = await docClient.send(command);
    return (response.Items as DeviceTag[]) || [];
  },

  async deleteTagFromGroup(groupId: string, tag: string): Promise<void> {
    // Step 1: Query only items matching groupId + tag (filter server-side)
    const targets: { imei: string; tag: string }[] = [];
    let lastKey: Record<string, any> | undefined;

    do {
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'byGroupId',
        KeyConditionExpression: 'groupId = :g',
        FilterExpression: 'tag = :t',
        ExpressionAttributeValues: {
          ':g': groupId,
          ':t': tag,
        },
        ExclusiveStartKey: lastKey,
      }));

      targets.push(...(result.Items ?? []) as { imei: string; tag: string }[]);
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    // Step 2: Batch delete in chunks of 25
    for (let i = 0; i < targets.length; i += 25) {
      const chunk = targets.slice(i, i + 25);
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: chunk.map(entry => ({
            DeleteRequest: {
              Key: { imei: entry.imei, tag: entry.tag },
            },
          })),
        },
      }));
    }
  },

};

