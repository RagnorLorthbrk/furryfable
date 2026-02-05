import fs from "fs";
import path from "path";
import axios from "axios";
import slugify from "slugify";
import { BLOG_DIR } from "./config.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "models/gemini-2.5-flash";

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY missing");
  process.exit(1);
}

export async function generateBlogHTML(topic) {
  const prompt = `
You are a professional SEO content writer.

Write a high-quality blog post about:
"${topic}"

Rules:
- Decide content length naturally based on SEO best practices
- Use proper HTML structure (H1, H2, H3)
- Sound human, natural, expert-written
- Suggest internal linking naturally (homepage, related blogs)
- Output ONLY valid HTML
`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }]
    }
  );

  return response.data.candidates[0].content.parts[0].text;
}

export function saveBlogHTML(topic, html) {
  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true });
  }

  const slug = slugify(topic, { lower: true, strict: true });
  const filePath = path.join(BLOG_DIR, `blog-${slug}.html`);

  fs.writeFileSync(filePath, html, "utf-8");

  return { slug, filePath };
}
