import { TagRepo } from "../repository/tag_repo";
import { DeviceTag } from "../types/tagType";

export class DeviceTagService {

    /** 
     * Get all tags for a specific device
     * @param imei 
     */
    async getTagsByImei(imei: string): Promise<DeviceTag[]> {
        return TagRepo.getTagsByImei(imei);
    }

    /**
     * Get all devices for a specific tag
     * @param tag 
     */
    async queryByTag(tag: string): Promise<DeviceTag[]> {
        return TagRepo.queryByTag(tag);
    }

    /**
     * Add a new tag entry
     * @param imei 
     * @param tag 
     * @param color 
     */
    async addEntry(imei: string, tag: string, color?: string): Promise<void> {
        return TagRepo.addEntry(imei, tag, color);
    }
    /**
     * Delete all entries for a specific tag
     * @param tag 
     */
    async deleteTag(tag: string): Promise<void> {
        return TagRepo.deleteTag(tag);
    }
    /**
     * Delete a specific tag from a device
     * @param imei 
     * @param tag 
     */
    async deleteTagFromDevice(imei: string, tag: string): Promise<void> {
        return TagRepo.deleteTagFromDevice(imei, tag);
    }
}
