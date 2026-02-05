import fs from "fs";
import path from "path";
import axios from "axios";
import slugify from "slugify";
import { BLOG_DIR } from "./config.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "models/gemini-2.5-flash";

if (!GEMINI_API_KEY) {
  throw new Error("❌ GEMINI_API_KEY missing");
}

/**
 * Generate blog HTML using Gemini
 */
export async function generateBlogHTML(title) {
  const prompt = `
You are a professional SEO content writer for a premium pet products brand.

Website: https://www.furryfable.com
Audience: USA & Canada
Niche: Dogs and Cats only

Write a high-quality SEO blog about:
"${title}"

Rules:
- Decide length naturally based on SEO best practices
- Use proper HTML structure (H1, H2, H3, p, ul, li)
- No markdown
- No emojis
- No AI disclaimers
- Include natural internal linking suggestions:
  - Homepage if relevant
  - Related blog topics if relevant
  - Relevant product or collection pages
- Output VALID HTML ONLY
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    }
  );

  return res.data.candidates[0].content.parts[0].text;
}

/**
 * Save blog HTML to /blog folder
 */
export function saveBlogHTML(title, html) {
  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true });
  }

  const slug = slugify(title, { lower: true, strict: true });
  const filePath = path.join(
    BLOG_DIR,
    `blog-${slug}.html`
  );

  fs.writeFileSync(filePath, html, "utf-8");

  return { slug, filePath };
}
