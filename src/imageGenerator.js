import fs from "fs";
import path from "path";
import OpenAI from "openai";
import axios from "axios";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const IMAGE_DIR = "images/blog";

/**
 * Generate featured + thumbnail images for a blog
 * FALLBACK: If OpenAI fails (quota), it will log and you can manually add.
 */
export async function generateImages(slug, imageTheme) {
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }

  const prompt = `Photorealistic lifestyle image for a premium pet brand: ${imageTheme}. Dogs and cats only. No text, typography, or logos. Clean background, natural lighting, 8k resolution.`;

  const featuredPath = path.join(IMAGE_DIR, `${slug}-featured.png`);
  const thumbPath = path.join(IMAGE_DIR, `${slug}-thumb.png`);

  try {
    console.log("🎨 Attempting Image Generation with OpenAI...");
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    
    const response = await openai.images.generate({
      model: "dall-e-3", // Standard model
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json"
    });

    fs.writeFileSync(featuredPath, Buffer.from(response.data[0].b64_json, "base64"));
    fs.writeFileSync(thumbPath, Buffer.from(response.data[0].b64_json, "base64"));
    
    return { featured: featuredPath, thumb: thumbPath };

  } catch (err) {
    console.error("⚠️ OpenAI Image Error (likely quota):", err.message);
    console.log("🔄 Fallback: As you are using Gemini for text, please use your Gemini Image credits manually if this is a recurring issue.");
    
    // Create a placeholder or throw a descriptive error to stop the push of broken files
    throw new Error("IMAGE_GENERATION_FAILED: Check OpenAI Quota or use Gemini.");
  }
}
