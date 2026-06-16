import { DeviceTagService } from '../service/deviceTagService';
import { DeviceTag } from '../types/tagType';
import { Request, Response } from 'express';
export class DeviceTagController {
    private deviceTagService: DeviceTagService;
    constructor() {
        this.deviceTagService = new DeviceTagService();
    }
    getTagsByImei = async (req: Request, res: Response): Promise<void> => {
        try {
            const { imei } = req.params;
            if (!imei || imei.trim() === '') {
                res.status(400).json({ message: "Missing required parameter: imei" });
                return;
            }
            const deviceTags: DeviceTag[] = await this.deviceTagService.getTagsByImei(imei);
            res.status(200).json(deviceTags);
        } catch (error) {
            console.error("Error in getTagsByImei:", error);
            res.status(500).json({ message: "Internal server error while getting tags" });
        }
    }
    queryByTag = async (req: Request, res: Response): Promise<void> => {
        try {
            const { tag } = req.params;
            if (!tag || tag.trim() === '') {
                res.status(400).json({ message: "Missing required parameter: tag" });
                return;
            }
            const deviceTags: DeviceTag[] = await this.deviceTagService.queryByTag(tag);
            res.status(200).json(deviceTags);
        } catch (error) {
            console.error("Error in queryByTag:", error);
            res.status(500).json({ message: "Internal server error while querying tags" });
        }
    }
    addEntry = async (req: Request, res: Response): Promise<void> => {
        try {
            const { imei, tag, color, group_id } = req.body;
            if (!imei || imei.trim() === '') {
                res.status(400).json({ message: "Missing required field: imei" });
                return;
            }
            if (!tag || tag.trim() === '') {
                res.status(400).json({ message: "Missing required field: tag" });
                return;
            }
            await this.deviceTagService.addEntry(imei, tag, color, group_id);
            res.status(200).json({ message: "Entry added successfully" });
        } catch (error) {
            console.error("Error in addEntry:", error);
            res.status(500).json({ message: "Internal server error while adding entry" });
        }
    }
    deleteTag = async (req: Request, res: Response): Promise<void> => {
        try {
            const { tag } = req.params;
            if (!tag || tag.trim() === '') {
                res.status(400).json({ message: "Missing required parameter: tag" });
                return;
            }
            await this.deviceTagService.deleteTag(tag);
            res.status(200).json({ message: "Tag deleted successfully" });
        } catch (error) {
            console.error("Error in deleteTag:", error);
            res.status(500).json({ message: "Internal server error while deleting tag" });
        }
    }
    deleteTagFromDevice = async (req: Request, res: Response): Promise<void> => {
        try {
            const { imei, tag } = req.params;
            if (!imei || imei.trim() === '') {
                res.status(400).json({ message: "Missing required parameter: imei" });
                return;
            }
            if (!tag || tag.trim() === '') {
                res.status(400).json({ message: "Missing required parameter: tag" });
                return;
            }
            await this.deviceTagService.deleteTagFromDevice(imei, tag);
            res.status(200).json({ message: "Tag removed from device successfully" });
        } catch (error) {
            console.error("Error in deleteTagFromDevice:", error);
            res.status(500).json({ message: "Internal server error while removing tag from device" });
        }
    }

    getByGroupId = async (req: Request, res: Response): Promise<void> => {
        try {
            const { group_id } = req.params;
            if (!group_id || group_id.trim() === '') {
                res.status(400).json({ message: "Missing required parameter: group_id" });
                return;
            }
            const deviceTags: DeviceTag[] = await this.deviceTagService.getByGroupId(group_id);
            res.status(200).json(deviceTags);
        } catch (error) {
            console.error("Error in getByGroupId:", error);
            res.status(500).json({ message: "Internal server error while getting devices" });
        }
    }

    deleteTagFromGroup = async (req: Request, res: Response): Promise<void> => {
        try {
            const { group_id, tag } = req.params;
            if (!group_id || group_id.trim() === '') {
                res.status(400).json({ message: "Missing required parameter: group_id" });
                return;
            }
            if (!tag || tag.trim() === '') {
                res.status(400).json({ message: "Missing required parameter: tag" });
                return;
            }
            await this.deviceTagService.deleteTagFromGroup(group_id, tag);
            res.status(200).json({ message: "Tag removed from group successfully" });
        } catch (error) {
            console.error("Error in deleteTagFromGroup:", error);
            res.status(500).json({ message: "Internal server error while removing tag from group" });
        }
    }
}
