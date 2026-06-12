import { DeviceTag, parseHexColor } from "../types/tagType";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand
} from "@aws-sdk/lib-dynamodb";

// Initialize the DynamoDB Client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TanE03_DeviceTags || 'TanE03_DeviceTags';
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
  async addEntry(imei: string, tag: string, color?: string): Promise<void> {
    const validatedColor = parseHexColor(color ?? "#E3F2FD");
    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        imei,
        tag,
        color: validatedColor,
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
      ExpressionAttributeValues: {
        ":tag": tag,
      },
    });
    const response = await docClient.send(command);
    const items = (response.Items as DeviceTag[]) || [];
    return items.length > 0 ? items[0].color : parseHexColor("#E3F2FD"); // return the color of the first entry
  }
};

