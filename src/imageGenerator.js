import fs from "fs";
import path from "path";
import OpenAI from "openai";
import axios from "axios";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const IMAGE_DIR = "images/blog";

export async function generateImages(slug, imageTheme) {
  if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });

  const featuredPath = path.join(IMAGE_DIR, `${slug}-featured.png`);
  
  // BRAND FORMULA: [Style Wrapper] + "A high-quality image of " + {{Image Theme}} + [Safety Guardrail]
  const styleWrapper = "Professional studio pet photography, soft bokeh, natural lighting. ";
  const safetyGuardrail = ". Ensure the pet looks happy and healthy. No distorted limbs, extra tails, or text in the background.";
  const finalPrompt = `${styleWrapper} A high-quality image of ${imageTheme}${safetyGuardrail}`;

  console.log(`📸 Prompt: ${finalPrompt}`);

  try {
    // ATTEMPT 1: OPENAI (DALL-E 3)
    console.log("🎨 Generating with OpenAI...");
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: finalPrompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json"
    });

    fs.writeFileSync(featuredPath, Buffer.from(response.data[0].b64_json, "base64"));
    return { featured: featuredPath };

  } catch (err) {
    console.warn("⚠️ OpenAI Limit/Error. Falling back to Gemini...");

    try {
      // ATTEMPT 2: GEMINI NATIVE IMAGE (Nano Banana)
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`;
      const res = await axios.post(url, {
        contents: [{ parts: [{ text: finalPrompt }] }]
      });

      const imageData = res.data.candidates[0].content.parts.find(p => p.inlineData)?.inlineData.data;
      if (!imageData) throw new Error("No image data returned from Gemini.");

      fs.writeFileSync(featuredPath, Buffer.from(imageData, "base64"));
      return { featured: featuredPath };

    } catch (fallbackErr) {
      console.error("❌ Both Image APIs failed:", fallbackErr.message);
      return { featured: null }; // Allows blog to publish without image instead of crashing
    }
  }
}
