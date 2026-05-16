import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Request logger
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  app.use(express.json({ limit: '10mb' }));

  // Resource to check if server is up
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  // AI Extraction Endpoint
  app.post("/api/extract", async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) return res.status(400).json({ error: "Image data required" });

      const openaiKey = process.env.OPENAI_API_KEY;

      if (!openaiKey) {
        console.error("OPENAI_API_KEY is missing from environment");
        return res.status(500).json({ error: "OPENAI_API_KEY is not configured on the server. Please add it in Settings > Secrets." });
      }

      const prompt = `Extract details from this shipping/invoice label. 
      Respond ONLY with a JSON object: 
      { "orderId": string, "customerName": string, "amount": number, "courierName": string, "state": string }. 
      
      CRITICAL: 
      1. Identify the courier company name (e.g., Delhivery, Bluedart, Ecom Express, Xpressbees, Shadowfax, Shiprocket, Amazon Shipping, etc.).
      2. Identify the destination STATE (e.g., Maharashtra, Gujarat, Delhi, Karnataka, etc.).
      
      Even if not explicitly labeled "Courier" or "State", look for their brand names or address components.
      If a value is not found, use an empty string or 0 for amount.`;

      let responseText = "";
      
      try {
        console.log("Using OpenAI GPT-4o-mini for extraction...");
        const openai = new OpenAI({ apiKey: openaiKey });
        
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: {
                    url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
                  }
                }
              ]
            }
          ],
          response_format: { type: "json_object" }
        });
        
        responseText = response.choices[0].message.content || "";
        console.log("OpenAI Response received.");
      } catch (openaiError) {
        console.error("OpenAI failed:", openaiError);
        throw openaiError;
      }
      console.log("AI Response received (length):", responseText.length);
      
      if (!responseText) {
        throw new Error("AI returned an empty response. Please try taking a clearer photo.");
      }
      const jsonStr = responseText.replace(/```json|```|json/g, "").trim();
      let extractedData;
      try {
        extractedData = JSON.parse(jsonStr);
      } catch {
        console.error("Failed to parse AI response as JSON:", responseText);
        throw new Error("AI returned an invalid format. Please try again with a clearer photo of the label.");
      }

      res.json(extractedData);
    } catch (error: unknown) {
      console.error("AI Extraction Error:", error);
      
      let clientError = "AI Extraction failed";
      
      const message = error instanceof Error ? error.message : "";
      const status = (error as { status?: string | number }).status;
      
      // Check for quota or rate limit errors
      if (
        message?.includes("429") || 
        message?.includes("quota") || 
        message?.includes("RESOURCE_EXHAUSTED") ||
        status === 429
      ) {
        clientError = "OPENAI_QUOTA_EXCEEDED: Daily limit reached or credits exhausted. Please check your OpenAI billing details or wait for the reset.";
      } 
      // Check for invalid API key
      else if (message?.includes("API_KEY_INVALID") || message?.includes("401")) {
        clientError = "INVALID_API_KEY: The OpenAI API key provided is invalid. Please check your key in Settings > Secrets.";
      }
      // Check for 404 (model not found)
      else if (message?.includes("404") || message?.includes("NOT_FOUND")) {
        clientError = "MODEL_NOT_FOUND: The specified OpenAI model was not found.";
      }
      
      res.status(500).json({ error: clientError });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("FATAL: Failed to start server:", err);
  process.exit(1);
});
