import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { IMAGE_DIR } from "./config.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateImages(slug, topic) {
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }

  const basePrompt = `
Eco-friendly pet supplies illustration.
Clean, modern, minimal, soft pastel colors.
No text. No watermark. Professional blog style.
`;

  async function createImage(filename, size) {
    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt: `${topic}. ${basePrompt}`,
      size
    });

    const buffer = Buffer.from(result.data[0].b64_json, "base64");
    const filePath = path.join(IMAGE_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  const featured = await createImage(`${slug}-featured.png`, "1536x1024");
  const thumb = await createImage(`${slug}-thumb.png`, "1024x1024");

  return { featured, thumb };
}
