import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY || "");
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // AI Extraction Endpoint
  app.post("/api/extract", async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) return res.status(400).json({ error: "Image data required" });

      const prompt = `Extract the following details from this shipping/invoice label. 
      Respond ONLY with a JSON object containing: 
      { "orderId": string, "customerName": string, "amount": number, "courierName": string }. 
      If a value is not found, use an empty string or 0 for amount.
      Look for Order ID, Reference Number, Customer/Recipient Name, and Total Amount (INR).`;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: imageBase64.split(",")[1] || imageBase64,
            mimeType: "image/jpeg",
          },
        },
      ]);

      const responseText = result.response.text();
      // Clean up potential markdown formatting in response
      const jsonStr = responseText.replace(/```json|```/g, "").trim();
      const extractedData = JSON.parse(jsonStr);

      res.json(extractedData);
    } catch (error: any) {
      console.error("AI Extraction Error:", error);
      res.status(500).json({ error: "Failed to extract data using AI" });
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

startServer();
