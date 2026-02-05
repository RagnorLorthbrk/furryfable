import OpenAI from "openai";
import fs from "fs";
import path from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const IMAGE_DIR = "images/blog";

export async function generateImages(slug, theme) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });

  const basePrompt = `
High-quality realistic photography.
Pet-related scene.
${theme}
No text. No typography. No logos. No words.
Soft lighting. Natural colors. Clean composition.
`;

  async function generate(name, size) {
    const img = await openai.images.generate({
      model: "gpt-image-1",
      prompt: basePrompt,
      size
    });

    const buffer = Buffer.from(img.data[0].b64_json, "base64");
    const filePath = path.join(IMAGE_DIR, `${slug}-${name}.png`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  return {
    featured: await generate("featured", "1536x1024"),
    thumbnail: await generate("thumb", "1024x1024")
  };
}
