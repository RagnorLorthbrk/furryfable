import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const IMAGE_DIR = "images/blog";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function generateImage(prompt, filePath) {
  const result = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1536x1024" // landscape, blog-friendly
  });

  const image_base64 = result.data[0].b64_json;
  const buffer = Buffer.from(image_base64, "base64");

  fs.writeFileSync(filePath, buffer);
}

export async function generateImages(slug, topic) {
  ensureDir(IMAGE_DIR);

  // 🔒 ABSOLUTE NO-TEXT RULE
  const baseRules = `
NO text.
NO words.
NO letters.
NO numbers.
NO symbols.
NO captions.
NO logos.
NO signage.
NO watermarks.
NO UI elements.

Image must contain ZERO readable or decorative text of any kind.
`;

  // 🎨 FEATURED IMAGE
  const featuredPrompt = `
High-quality, realistic illustration related to:
"${topic}"

Style:
- Clean
- Professional
- Natural lighting
- Soft colors
- Blog header style

${baseRules}
`;

  const featuredPath = path.join(
    IMAGE_DIR,
    `${slug}-featured.png`
  );

  await generateImage(featuredPrompt, featuredPath);

  // 🧩 THUMBNAIL IMAGE
  const thumbPrompt = `
Minimal, visually appealing illustration inspired by:
"${topic}"

Style:
- Simple composition
- Strong central subject
- Calm background
- Suitable for blog thumbnail

${baseRules}
`;

  const thumbPath = path.join(
    IMAGE_DIR,
    `${slug}-thumb.png`
  );

  await generateImage(thumbPrompt, thumbPath);

  return {
    featured: featuredPath,
    thumb: thumbPath
  };
}
