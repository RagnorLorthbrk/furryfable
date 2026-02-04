import fs from "fs";
import path from "path";
import axios from "axios";
import { generateBlogImages } from "./imageGenerator.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY missing");
  process.exit(1);
}

console.log("Gemini key present:", !!GEMINI_API_KEY);

// ------------------ CONFIG ------------------
const BLOG_DIR = "blog";
const MODEL = "models/gemini-2.5-flash";
// --------------------------------------------

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function generateBlog(topic) {
  const prompt = `
You are a professional SEO content writer.

Write a high-quality blog post about:
"${topic}"

Guidelines:
- Let content length be decided naturally for best SEO
- Use proper H1, H2, H3 structure
- Suggest internal links naturally (do NOT insert URLs)
- Write clean, human, non-AI sounding content
- Output VALID HTML only (no markdown)
`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    }
  );

  return response.data.candidates[0].content.parts[0].text;
}

async function main() {
  const topic =
    "The Ultimate Guide to Eco-Friendly Pet Supplies for Sustainable Living";

  const slug = slugify(topic);

  console.log("Generating blog content for:", topic);

  const html = await generateBlog(topic);

  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true });
  }

  const blogPath = path.join(BLOG_DIR, `blog-${slug}.html`);
  fs.writeFileSync(blogPath, html, "utf-8");

  console.log("Blog saved:", blogPath);

  // ---- IMAGE GENERATION (Option B) ----
  await generateBlogImages(topic, slug);
}

main().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
