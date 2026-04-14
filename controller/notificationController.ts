import { Request, Response } from 'express';
import { sendNotification } from '../service/sendNotification';

export const notificationController = {
  /**
   * POST /send-notification
   * Body: { imei: string, message: string }
   */
  async send(req: Request, res: Response) {
    const { imei, message } = req.body;

    if (!imei || !message) {
      return res.status(400).json({ error: "IMEI and message are required" });
    }

    try {
      const result = await sendNotification(imei, message);

      if (result.success) {
        return res.status(200).json({
          status: "Success",
          message: result.message
        });
      } else {
        return res.status(400).json({
          status: "Error",
          error: result.error
        });
      }
    } catch (error: any) {
      console.error("Unexpected Controller Error:", error);
      return res.status(500).json({
        status: "Error",
        error: "An unexpected server error occurred."
      });
    }
  }
};
