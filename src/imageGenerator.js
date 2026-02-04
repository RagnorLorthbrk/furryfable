import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY missing");
  process.exit(1);
}

const IMAGE_DIR = "images";

export async function generateImages({ title, slug }) {
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }

  const basePrompt = `
Premium lifestyle photography for a high-end pet brand (FurryFable).

Scene:
Dogs and/or cats in a real home environment using premium pet products.

Style:
- Photorealistic (NOT illustration, NOT cartoon)
- Clean, premium, modern
- Soft natural lighting with warm tones
- Minimal, uncluttered background
- Lifestyle photography look

Mood:
Calm, trustworthy, high-quality, aspirational

Rules:
- No text
- No logos
- No watermarks
- No UI elements

Blog topic context:
"${title}"
`;

  const images = [
    { type: "featured", filename: `${slug}-featured.jpg` },
    { type: "thumbnail", filename: `${slug}-thumbnail.jpg` }
  ];

  for (const img of images) {
    console.log(`Generating ${img.type} image...`);

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt: basePrompt,
      size: "1536x1024" // ✅ highest supported landscape size
    });

    const imageBase64 = result.data[0].b64_json;
    const buffer = Buffer.from(imageBase64, "base64");

    const filePath = path.join(IMAGE_DIR, img.filename);
    fs.writeFileSync(filePath, buffer);

    console.log(`Saved image: ${filePath}`);
  }
}
