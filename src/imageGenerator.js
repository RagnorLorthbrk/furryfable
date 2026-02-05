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

  const generate = async (suffix, size) => {
    const res = await openai.images.generate({
      model: "gpt-image-1",
      prompt: `Minimal, clean, blog illustration for: ${topic}`,
      size
    });

    const filePath = path.join(
      IMAGE_DIR,
      `${slug}-${suffix}.png`
    );

    const buffer = Buffer.from(res.data[0].b64_json, "base64");
    fs.writeFileSync(filePath, buffer);

    return `/images/blog/${slug}-${suffix}.png`;
  };

  return {
    featured: await generate("featured", "1536x1024"),
    thumb: await generate("thumb", "1024x1024")
  };
}
