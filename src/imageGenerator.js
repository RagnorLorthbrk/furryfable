import fs from "fs";
import path from "path";
import axios from "axios";
import slugify from "slugify";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "models/gemini-2.5-flash-image-preview";

if (!GEMINI_API_KEY) {
  throw new Error("❌ GEMINI_API_KEY missing for image generation");
}

const IMAGE_DIR = "images/blog";

/**
 * Generate blog images (featured + thumbnail)
 * NO TEXT on image
 */
export async function generateBlogImages(title) {
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }

  const slug = slugify(title, { lower: true, strict: true });

  const featuredPath = path.join(
    IMAGE_DIR,
    `${slug}-featured.png`
  );

  const thumbPath = path.join(
    IMAGE_DIR,
    `${slug}-thumb.png`
  );

  const prompt = `
Photorealistic lifestyle image for a premium pet brand.

Subject:
Dogs or cats only (based on context of "${title}")

Style rules:
- NO text
- NO typography
- NO logos
- Clean, modern, premium
- Natural lighting
- Soft background
- Professional photography look
- Square-safe composition
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    ]
  );

  const imageBase64 =
    res.data.candidates[0].content.parts[0].inlineData.data;

  const buffer = Buffer.from(imageBase64, "base64");

  fs.writeFileSync(featuredPath, buffer);
  fs.writeFileSync(thumbPath, buffer);

  return {
    featured: featuredPath,
    thumbnail: thumbPath
  };
}
