import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const IMAGE_DIR = "images/blog";

function ensureDir() {
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }
}

async function generateImage(prompt, filename, size) {
  const result = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size
  });

  const image_base64 = result.data[0].b64_json;
  const imageBuffer = Buffer.from(image_base64, "base64");

  const filePath = path.join(IMAGE_DIR, filename);
  fs.writeFileSync(filePath, imageBuffer);

  console.log(`Saved image: ${filePath}`);
}

export async function generateBlogImages(topic, slug) {
  ensureDir();

  console.log("Generating featured image...");
  await generateImage(
    `High-quality professional blog featured image about ${topic}. 
     Clean background, modern, premium, pet-focused, natural lighting.`,
    `${slug}-featured.png`,
    "1536x1024"
  );

  console.log("Generating thumbnail image...");
  await generateImage(
    `Minimal square thumbnail image representing ${topic}. 
     Simple composition, bold subject, pet-related.`,
    `${slug}-thumb.png`,
    "1024x1024"
  );
}
