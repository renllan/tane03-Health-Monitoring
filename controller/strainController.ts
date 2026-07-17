import { Request, Response } from 'express';
import { StrainService } from '../service/strainService';
export class StrainController {
    private strainService: StrainService;
    constructor() {
        this.strainService = new StrainService();
    }
    async getStrain(req: any, res: any) {
        try {
            const { imei, date } = req.params;
            console.log(`[StrainController] getStrain called imei=${imei} date=${date}`);
            if (!imei || !date) {
                return res.status(400).json({ error: "Missing required parameters: imei and date" });
            }

            const strainData = await this.strainService.getStrain(imei, date);
            console.log(`[StrainController] strainData result:`, strainData);
            return res.status(200).json(strainData);
        }
        catch (error: any) {
            console.error("Error in getStrain:", error);
            return res.status(error.status || 500).json({ error: error.message || "Internal Service Error" });
        }

    }

}