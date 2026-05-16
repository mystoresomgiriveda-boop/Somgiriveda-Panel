import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
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

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error("GEMINI_API_KEY is missing from environment");
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server. Please add it in Settings > Secrets." });
      }

      console.log("Initializing Gemini AI...");
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `Extract details from this shipping/invoice label. 
      Respond ONLY with a JSON object: 
      { "orderId": string, "customerName": string, "amount": number, "courierName": string, "state": string }. 
      
      CRITICAL: 
      1. Identify the courier company name (e.g., Delhivery, Bluedart, Ecom Express, Xpressbees, Shadowfax, Shiprocket, Amazon Shipping, etc.).
      2. Identify the destination STATE (e.g., Maharashtra, Gujarat, Delhi, Karnataka, etc.).
      
      Even if not explicitly labeled "Courier" or "State", look for their brand names or address components.
      If a value is not found, use an empty string or 0 for amount.`;

      console.log("Sending request to Gemini Flash...");
      const result = await ai.models.generateContent({
        model: "gemini-1.5-flash-latest",
        contents: {
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64,
                mimeType: "image/jpeg",
              },
            },
          ]
        }
      });

      const responseText = result.text || "";
      console.log("AI Response received:", responseText);
      
      // Clean up potential markdown formatting in response
      const jsonStr = responseText.replace(/```json|```|json/g, "").trim();
      const extractedData = JSON.parse(jsonStr);

      res.json(extractedData);
    } catch (error: unknown) {
      console.error("AI Extraction Error:", error);
      
      let clientError = "AI Extraction failed";
      
      const message = error instanceof Error ? error.message : "";
      const status = (error as { status?: string }).status;
      
      // Check for quota or rate limit errors
      if (
        message?.includes("429") || 
        message?.includes("quota") || 
        message?.includes("RESOURCE_EXHAUSTED") ||
        status === "RESOURCE_EXHAUSTED"
      ) {
        clientError = "GEMINI_QUOTA_EXCEEDED: You have exceeded the daily free tier limit (1,500 requests per day for Gemini 1.5 Flash). To continue scanning, please use a Billing-enabled API Key or wait for your quota to reset tomorrow.";
      } 
      // Check for invalid API key
      else if (message?.includes("API_KEY_INVALID") || message?.includes("401")) {
        clientError = "INVALID_API_KEY: The Gemini API key provided is invalid. Please check your key in Settings > Secrets.";
      }
      // Check for 404 (model not found)
      else if (message?.includes("404") || message?.includes("NOT_FOUND")) {
        clientError = "MODEL_NOT_FOUND: The specified Gemini model was not found. Reverting to standard model.";
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
