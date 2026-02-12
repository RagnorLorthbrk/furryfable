import fs from "fs";
import path from "path";
import OpenAI from "openai";
import axios from "axios";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const IMAGE_DIR = "images/blog";

/**
 * Generate images with OpenAI
 */
async function generateWithOpenAI(slug, prompt) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const featured = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1536x1024"
  });

  const featuredPath = path.join(IMAGE_DIR, `${slug}-featured.png`);

  fs.writeFileSync(
    featuredPath,
    Buffer.from(featured.data[0].b64_json, "base64")
  );

  const thumb = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024"
  });

  const thumbPath = path.join(IMAGE_DIR, `${slug}-thumb.png`);

  fs.writeFileSync(
    thumbPath,
    Buffer.from(thumb.data[0].b64_json, "base64")
  );

  return { featured: featuredPath, thumb: thumbPath };
}

/**
 * Generate images with Gemini (fallback)
 */
async function generateWithGemini(slug, prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY missing");
  }

  const model = "models/gemini-2.5-flash";

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        responseModalities: ["IMAGE"]
      }
    }
  );

  const imageBase64 =
    response.data.candidates?.[0]?.content?.parts?.find(
      p => p.inlineData
    )?.inlineData?.data;

  if (!imageBase64) {
    throw new Error("Gemini did not return image data");
  }

  const featuredPath = path.join(IMAGE_DIR, `${slug}-featured.png`);
  const thumbPath = path.join(IMAGE_DIR, `${slug}-thumb.png`);

  fs.writeFileSync(featuredPath, Buffer.from(imageBase64, "base64"));
  fs.writeFileSync(thumbPath, Buffer.from(imageBase64, "base64"));

  return { featured: featuredPath, thumb: thumbPath };
}

/**
 * Public function with automatic fallback
 */
export async function generateImages(slug, imageTheme) {
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }

  const prompt = `
Photorealistic premium pet lifestyle image.
Dogs and cats only.
${imageTheme || ""}
No text.
No typography.
No logos.
Clean minimal background.
Soft natural lighting.
High quality.
`;

  try {
    console.log("🖼️ Trying OpenAI image generation...");
    return await generateWithOpenAI(slug, prompt);
  } catch (err) {
    console.warn("⚠️ OpenAI failed. Switching to Gemini...");
    return await generateWithGemini(slug, prompt);
  }
}
