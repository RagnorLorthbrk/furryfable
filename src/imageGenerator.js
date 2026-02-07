import fs from "fs";
import path from "path";
import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  throw new Error("❌ OPENAI_API_KEY missing");
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

const IMAGE_DIR = "images/blog";

/**
 * Generate featured + thumbnail images for a blog
 */
export async function generateImages(slug, title) {
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }

  const prompt = `
Photorealistic lifestyle image for a premium pet brand.
Dogs and cats only.
No text.
No typography.
No logos.
Clean background.
Natural lighting.
High quality.
`;

  // FEATURED IMAGE
  const featured = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1536x1024"
  });

  const featuredPath = path.join(
    IMAGE_DIR,
    `${slug}-featured.png`
  );

  fs.writeFileSync(
    featuredPath,
    Buffer.from(featured.data[0].b64_json, "base64")
  );

  // THUMBNAIL IMAGE
  const thumb = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024"
  });

  const thumbPath = path.join(
    IMAGE_DIR,
    `${slug}-thumb.png`
  );

  fs.writeFileSync(
    thumbPath,
    Buffer.from(thumb.data[0].b64_json, "base64")
  );

  return {
    featured: featuredPath,
    thumb: thumbPath
  };
}
