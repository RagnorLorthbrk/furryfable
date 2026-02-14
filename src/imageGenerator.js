import fs from "fs";
import path from "path";
import OpenAI from "openai";
import axios from "axios";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const IMAGE_DIR = "images/blog";

export async function generateImages(slug, imageTheme) {
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }

  const featuredPath = path.join(IMAGE_DIR, `${slug}-featured.png`);
  const prompt = `Photorealistic lifestyle pet photography: ${imageTheme}. High-end lighting, dogs and cats only, no text.`;

  // --- ATTEMPT 1: OPENAI ---
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
    
    // --- ATTEMPT 2: GEMINI FALLBACK ---
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`;
      const geminiRes = await axios.post(geminiUrl, {
        contents: [{ parts: [{ text: `Generate image: ${prompt}` }] }]
      });

      const imageData = geminiRes.data.candidates[0].content.parts.find(p => p.inlineData)?.inlineData.data;
      if (!imageData) throw new Error("No image data from Gemini.");

      fs.writeFileSync(featuredPath, Buffer.from(imageData, "base64"));
      console.log("✅ Success: Image generated via Gemini.");
      return { featured: featuredPath };

    } catch (fallbackErr) {
      console.error("❌ Both AI services failed for images.");
      return { featured: null };
    }
  }
}
