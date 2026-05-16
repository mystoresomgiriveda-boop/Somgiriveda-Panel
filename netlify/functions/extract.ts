import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

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
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!geminiKey && !openaiKey) {
      console.error("Neither GEMINI_API_KEY nor OPENAI_API_KEY is configured on Netlify.");
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: "No AI API keys configured on Netlify. Please add GEMINI_API_KEY or OPENAI_API_KEY in Site Settings." }) 
      };
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

    // Try Gemini if key exists
    if (geminiKey) {
      try {
        console.log("Extending request to Gemini AI (1.5 Flash)...");
        const ai = new GoogleGenAI({
          apiKey: geminiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build-netlify' } }
        });

        let result;
        const part1 = { text: prompt };
        const part2 = {
          inlineData: {
            data: imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64,
            mimeType: "image/jpeg",
          },
        };

        try {
          result = await ai.models.generateContent({
            model: "gemini-1.5-flash-latest",
            contents: [{ parts: [part1, part2] }]
          });
        } catch (firstError: unknown) {
          const firstMsg = firstError instanceof Error ? firstError.message : "Unknown error";
          console.warn("Gemini 1.5 Flash failed, trying fallback models...", firstMsg);
          try {
            result = await ai.models.generateContent({
              model: "gemini-1.5-flash",
              contents: [{ parts: [part1, part2] }]
            });
          } catch {
             result = await ai.models.generateContent({
               model: "gemini-3-flash-preview",
               contents: [{ parts: [part1, part2] }]
             });
          }
        }
        responseText = result.text || "";
      } catch (geminiError) {
        console.error("Gemini failed in function:", geminiError);
        if (!openaiKey) throw geminiError;
      }
    }

    // Try OpenAI if Gemini failed or missing
    if (!responseText && openaiKey) {
      try {
        console.log("Trying OpenAI in Netlify function...");
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
      } catch (openaiError) {
        console.error("OpenAI failed in function:", openaiError);
        throw openaiError;
      }
    }

    if (!responseText) {
      throw new Error("AI returned an empty response.");
    }
    const jsonStr = responseText.replace(/```json|```|json/g, "").trim();
    let extractedData;
    try {
      extractedData = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response as JSON:", responseText);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "AI returned an invalid format. Please try again with a clearer photo of the label." }),
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
      clientError = "GEMINI_QUOTA_EXCEEDED: Daily limit reached (1,500 requests/day for Flash). Note: Free tier allows 1,500 requests per day. If you need more, please add a billing-enabled key.";
    } else if (message?.includes("API_KEY_INVALID")) {
      clientError = "INVALID_API_KEY: Please check your Gemini API key in Netlify settings.";
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: clientError }),
    };
  }
};
