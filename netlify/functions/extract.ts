import { GoogleGenAI } from "@google/genai";

export const handler = async (event: { httpMethod: string; body: string }) => {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const { imageBase64 } = JSON.parse(event.body || "{}");
    if (!imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: "Image data required" }) };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing from Netlify environment variables");
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: "GEMINI_API_KEY is not configured on Netlify. Please add it to your Site Settings > Environment variables." }) 
      };
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build-netlify',
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

    console.log("Extending request to Gemini 1.5 Flash...");
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
    const jsonStr = responseText.replace(/```json|```|json/g, "").trim();
    const extractedData = JSON.parse(jsonStr);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(extractedData),
    };
  } catch (error: unknown) {
    console.error("Netlify Function Error:", error);
    
    let clientError = "AI Extraction failed";
    const message = error instanceof Error ? error.message : "";
    
    if (message?.includes("429") || message?.includes("quota") || message?.includes("RESOURCE_EXHAUSTED")) {
      clientError = "GEMINI_QUOTA_EXCEEDED: Daily limit reached (1,500 requests/day for Flash). Please try again tomorrow or add a billing-enabled key in Netlify.";
    } else if (message?.includes("API_KEY_INVALID")) {
      clientError = "INVALID_API_KEY: Please check your Gemini API key in Netlify settings.";
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: clientError }),
    };
  }
};
