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

    const openaiKey = process.env.OPENAI_API_KEY;

    if (!openaiKey) {
      console.error("OPENAI_API_KEY is missing from Netlify environment variables.");
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: "OPENAI_API_KEY is not configured on Netlify. Please add it to your Site Settings." }) 
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

    try {
      console.log("Using OpenAI GPT-4o-mini in Netlify function...");
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
      clientError = "OPENAI_QUOTA_EXCEEDED: Daily limit reached or credits exhausted. Please check your OpenAI billing details or wait for the reset.";
    } else if (message?.includes("API_KEY_INVALID")) {
      clientError = "INVALID_API_KEY: Please check your OpenAI API key in Netlify settings.";
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: clientError }),
    };
  }
};
