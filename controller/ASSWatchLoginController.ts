import { loginToAAASWatch } from "../service/loginToAAASWatch";
import { Request, Response } from 'express';

export const ASSWatchLoginController = {
    async login(req: Request, res: Response) {
        const { imei } = req.body;

        if (!imei) {
            return res.status(400).json({ error: "IMEI is required" });
        }

        try {
            // loginToAAASWatch returns a string (the token), not an object with .success
            const token = await loginToAAASWatch(imei);

            // If no error was thrown, the login was successful.
            return res.status(200).json({
                status: "Success",
                token: token
            });

        } catch (error: any) {
            console.error("Unexpected Controller Error:", error);
            return res.status(500).json({
                status: "Error",
                error: error.message || "An unexpected server error occurred."
            });
        }
    }
};
