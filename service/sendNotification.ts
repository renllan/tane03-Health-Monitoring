import { loginToAAASWatch } from "./loginToAAASWatch";


export async function sendNotification(imei: string, message: string): Promise<{ success: boolean; message?: string; error?: string }> {
   console.log(`[sendNotification] to ${imei}: ${message}`);
   try {
      const token = await loginToAAASWatch(imei);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000); // 3s timeout

      const response = await fetch(`${process.env.AAASWatch_BASE_URL}/downlinkMessage/${imei}/send`, {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
            'Authorization': token,
         },
         body: JSON.stringify({ message }),
         signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
         return { success: true, message: "Message dispatched to watch successfully" };
      }

      const errorBody = await response.text();
      console.error(`AAASWatch API error ${response.status}:`, errorBody);
      return { success: false, error: `API responded with status ${response.status}: ${errorBody}` };

   } catch (error: any) {
      console.error("sendNotification failed:", error.message);
      return { success: false, error: error.message };
   }
}

