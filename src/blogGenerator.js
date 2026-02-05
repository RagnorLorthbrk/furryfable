import axios from "axios";
import fs from "fs";
import path from "path";
import { BLOG_DIR, GEMINI_MODEL } from "./config.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function generateBlogHTML(topic) {
  const prompt = `
You are a professional SEO content writer.

Write a high-quality blog post about:
"${topic}"

Rules:
- Let length be decided naturally by SEO best practices
- Use proper H1, H2, H3 structure
- Suggest internal links naturally (homepage, related blogs)
- Sound human and authoritative
- OUTPUT VALID HTML ONLY
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }]
    }
  );

  return res.data.candidates[0].content.parts[0].text;
}

export function saveBlogHTML(topic, html) {
  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true });
  }

  const slug = slugify(topic);
  const filePath = path.join(BLOG_DIR, `blog-${slug}.html`);
  fs.writeFileSync(filePath, html, "utf-8");

  return { slug, filePath };
}
