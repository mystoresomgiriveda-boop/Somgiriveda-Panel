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

    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      console.error("GEMINI_API_KEY is missing from Netlify environment variables.");
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: "GEMINI_API_KEY is not configured on Netlify. Please add it in Site Settings." }) 
      };
    }

    const prompt = `Extract details from this shipping/invoice label. 
    Respond ONLY with a JSON object: 
    { "orderId": "string", "amount": number, "customerName": "string", "courierName": "string", "state": "string" }
    
    Look for Order ID, Customer Name, Total/Price, Courier, and State.
    If a value is not found, use an empty string or 0 for amount.`;

    let responseText = "";

    // Try Gemini 1.5 Flash (1500 free/day)
    try {
      console.log("Netlify Function: Using Gemini 1.5 Flash...");
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64,
            mimeType: "image/jpeg",
          },
        },
      ]);
      
      responseText = result.response.text();
    } catch (geminiError: unknown) {
      const errorMsg = geminiError instanceof Error ? geminiError.message : String(geminiError);
      console.error("Gemini failed in function:", errorMsg);
      throw geminiError;
    }

    if (!responseText) {
      throw new Error("AI returned an empty response.");
    }

    // Extract JSON more robustly
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    } else {
      jsonStr = responseText.replace(/```json|```|json/g, "").trim();
    }

    let extractedData;
    try {
      extractedData = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response as JSON. Raw:", responseText);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "AI scanning failed to format data correctly. Please try scanning again with the label clearly in focus." }),
      };
    }

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
      clientError = "GEMINI_QUOTA_EXCEEDED: Free tier limits reached (1,500 scans/day). Please wait for the reset or use a different key.";
    } else if (message?.includes("API_KEY_INVALID")) {
      clientError = "INVALID_API_KEY: Please check your Gemini API key in Netlify settings.";
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: clientError }),
    };
  }
};
