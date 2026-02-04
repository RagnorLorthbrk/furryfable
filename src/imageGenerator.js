import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateFeaturedImage({
  slug,
  imagePrompt,
  altText
}) {
  const imagesDir = path.join("blog", "images");

  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const imagePath = path.join(
    imagesDir,
    `${slug}-featured.png`
  );

  console.log("Generating featured image with GPT-Image...");

  const result = await openai.images.generate({
    model: "gpt-image-1",
    prompt: imagePrompt,
    size: "1200x630"
  });

  const imageBase64 = result.data[0].b64_json;
  const imageBuffer = Buffer.from(imageBase64, "base64");

  fs.writeFileSync(imagePath, imageBuffer);

  console.log(`Image saved at ${imagePath}`);

  return {
    imagePath,
    imageTag: `
<img
  src="/${imagePath}"
  alt="${altText}"
  loading="lazy"
/>
`.trim()
  };
}
