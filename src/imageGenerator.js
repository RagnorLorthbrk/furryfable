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
Premium lifestyle photography for a high-end pet brand.

Subject:
Dogs and/or cats in a real-life home environment.

Style:
- Clean, premium, professional
- Soft natural lighting, warm tones
- Minimal background, uncluttered
- Realistic photography (not illustration, not cartoon)
- No text, no logos, no overlays

Mood:
Warm, calm, trustworthy, modern

Context:
Blog topic: "${title}"
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
      size: "2048x1080"
    });

    const imageBase64 = result.data[0].b64_json;
    const buffer = Buffer.from(imageBase64, "base64");

    const filePath = path.join(IMAGE_DIR, img.filename);
    fs.writeFileSync(filePath, buffer);

    console.log(`Saved image: ${filePath}`);
  }
}
