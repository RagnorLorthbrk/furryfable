import fs from "fs";
import path from "path";
import OpenAI from "openai";
import axios from "axios";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const IMAGE_DIR = "images/blog";

/**
 * Main function with Fallback Logic:
 * 1. Try OpenAI (DALL-E 3)
 * 2. If it fails, Try Gemini (Nano Banana)
 */
export async function generateImages(slug, imageTheme) {
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }

  const featuredPath = path.join(IMAGE_DIR, `${slug}-featured.png`);
  const prompt = `Photorealistic lifestyle pet photography: ${imageTheme}. High-end lighting, dogs and cats only, no text, premium brand feel.`;

  // --- STEP 1: TRY OPENAI ---
  try {
    console.log("🎨 Attempting OpenAI Image Generation...");
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json"
    });

    fs.writeFileSync(featuredPath, Buffer.from(response.data[0].b64_json, "base64"));
    console.log("✅ Success: Image generated via OpenAI.");
    return { featured: featuredPath };

  } catch (err) {
    console.warn("⚠️ OpenAI Failed (Quota/Error). Switching to Gemini Fallback...");
    
    // --- STEP 2: FALLBACK TO GEMINI ---
    try {
      // Using the latest Gemini 2.5 Flash Image model (Nano Banana)
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`;
      
      const geminiRes = await axios.post(geminiUrl, {
        contents: [{ parts: [{ text: `Generate a high-quality 1024x1024 image: ${prompt}` }] }]
      });

      // Gemini returns image data in the parts array
      const imageData = geminiRes.data.candidates[0].content.parts.find(p => p.inlineData)?.inlineData.data;

      if (!imageData) throw new Error("Gemini returned no image data.");

      fs.writeFileSync(featuredPath, Buffer.from(imageData, "base64"));
      console.log("✅ Success: Image generated via Gemini Fallback.");
      return { featured: featuredPath };

    } catch (geminiErr) {
      console.error("❌ CRITICAL: Both OpenAI and Gemini failed to generate images.", geminiErr.message);
      // Return null so the blog still publishes, just without a new image
      return { featured: null };
    }
  }
}
