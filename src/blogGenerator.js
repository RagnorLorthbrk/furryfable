import fs from "fs";
import path from "path";
import axios from "axios";
import { BLOG_DIR } from "./config.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "models/gemini-2.5-flash";

if (!GEMINI_API_KEY) {
  throw new Error("❌ GEMINI_API_KEY missing");
}

/**
 * Build internal blog links using EXISTING slugs only
 */
function buildInternalBlogLinks(existingBlogs = []) {
  return existingBlogs
    .filter(b => b.slug)
    .slice(0, 3)
    .map(
      b =>
        `<li><a href="https://www.furryfable.com/blogs/blog/${b.slug}">${b.title}</a></li>`
    )
    .join("\n");
}

/**
 * Generate blog HTML using Gemini
 */
export async function generateBlogHTML({
  title,
  primaryKeyword,
  existingBlogs = []
}) {
  const internalBlogLinksHTML = buildInternalBlogLinks(existingBlogs);

  const prompt = `
You are a professional SEO content writer for a premium pet brand.

Website: https://www.furryfable.com
Audience: USA & Canada
Niche: Dogs and Cats only

Write a high-quality SEO blog about:
"${title}"

Primary keyword:
"${primaryKeyword}"

Rules:
- Decide length naturally based on SEO best practices
- Use proper HTML (h1, h2, h3, p, ul, li)
- No markdown
- No emojis
- No AI disclaimers
- DO NOT invent blog URLs
- Use ONLY the internal blog links provided below
- Use product/collection links only if relevant

Internal Blog Links (USE THESE EXACT URLS):
<ul>
${internalBlogLinksHTML}
</ul>

Allowed Internal Pages:
- Homepage: https://www.furryfable.com
- Collections:
  https://www.furryfable.com/collections/pet-toys
  https://www.furryfable.com/collections/pet-water-bottle
  https://www.furryfable.com/collections/pet-apparels
  https://www.furryfable.com/collections/pet-outdoor-supplies
  https://www.furryfable.com/collections/harness-and-leash
  https://www.furryfable.com/collections/
  https://www.furryfable.com/collections/all

Output VALID HTML ONLY.
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }]
    }
  );

  return res.data.candidates[0].content.parts[0].text;
}

/**
 * Save blog HTML
 */
export function saveBlogHTML(slug, html) {
  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true });
  }

  const filePath = path.join(BLOG_DIR, `blog-${slug}.html`);
  fs.writeFileSync(filePath, html, "utf-8");

  return filePath;
}
