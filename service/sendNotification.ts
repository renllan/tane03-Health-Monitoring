import { loginToAAASWatch } from "./loginToAAASWatch";


export async function sendNotification(imei: string, message: string): Promise<{ success: boolean; message?: string; error?: string }> {
   //login to AAA's watch
   try {
      const token: string = await loginToAAASWatch(imei);

      let response: Response | null = null;
      let lastErrorStatus = 0;
      let lastErrorBody = "";

      for (let attempt = 1; attempt <= 3; attempt++) {
         try {
            response = await fetch(`${process.env.AAASWatch_BASE_URL}/downlinkMessage/${imei}/send`, {
               method: 'POST',
               headers: {
                  'Content-Type': 'application/json',
                  'Authorization': token,
               },
               body: JSON.stringify({ message }),
            });

            if (response.ok) {
               return {
                  success: true,
                  message: "Message dispatched to watch successfully"
               };
            }

            lastErrorStatus = response.status;
            lastErrorBody = await response.text();

            // If it's a 4xx error (like 401 Unauthorized or 400 Bad Request), don't retry.
            // Only retry on 5xx errors (like 504 Gateway Timeout or 500 Internal Server Error)
            if (response.status < 500) {
               break;
            }

            console.warn(`AAASWatch API returned ${response.status} (Attempt ${attempt}/3). Retrying in 2 seconds...`);
            await new Promise(res => setTimeout(res, 2000));

         } catch (fetchError: any) {
            // This catches network layer errors (e.g. DNS failure)
            lastErrorStatus = 500;
            lastErrorBody = fetchError.message;
            console.warn(`Network error (Attempt ${attempt}/3). Retrying in 2 seconds...`);
            await new Promise(res => setTimeout(res, 2000));
         }
      }

      // If we fall out of the loop, all attempts failed or we got a non-retryable 4xx error
      console.error(`AAASWatch API Error (Status ${lastErrorStatus}):`, lastErrorBody);
      return {
         success: false,
         error: `Failed to send to device. API responded with status ${lastErrorStatus}: ${lastErrorBody}`
      };
   }
   catch (error: any) {
      console.error("Internal service error during notification:", error);
      return {
         success: false,
         error: error.message || "An unexpected error occurred during message delivery"
      };
   }
}
