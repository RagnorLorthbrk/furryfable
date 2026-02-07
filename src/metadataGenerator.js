import axios from "axios";

export async function generateMetadata(blogContent) {
  const prompt = `
You are an SEO expert for a premium pet brand.

From the blog content below, generate STRICT JSON with:
- excerpt: max 280 characters
- metaDescription: max 160 characters
- tags: 5–8 short, SEO-friendly tags (lowercase, no emojis)

Rules:
- Do NOT include markdown
- Do NOT include explanations
- Output JSON only
- Make it sound human, expert, and trustworthy

Blog content:
"""
${blogContent}
"""
`;

  const response = await axios.post(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
    {
      contents: [{ parts: [{ text: prompt }] }]
    },
    {
      params: { key: process.env.GEMINI_API_KEY },
      headers: { "Content-Type": "application/json" }
    }
  );

  const text =
    response.data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error("Gemini response was not valid JSON");
  }

  return {
    excerpt: parsed.excerpt?.slice(0, 280) || "",
    metaDescription: parsed.metaDescription?.slice(0, 160) || "",
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : []
  };
}
