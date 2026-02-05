import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { IMAGE_DIR, IMAGE_SIZES } from "./config.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateImages(slug, title) {
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }

  const basePrompt = `
Flat illustration, eco-friendly pet supplies, dogs and cats,
clean background, modern, soft colors, sustainability theme.
Title inspiration: ${title}
`;

  const images = {};

  for (const type of ["featured", "thumb"]) {
    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt: basePrompt,
      size: IMAGE_SIZES[type]
    });

    const buffer = Buffer.from(result.data[0].b64_json, "base64");

    const filename = `${slug}-${type}.png`;
    const filePath = path.join(IMAGE_DIR, filename);

    fs.writeFileSync(filePath, buffer);
    images[type] = filePath;
  }

  return images;
}
