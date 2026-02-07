import axios from "axios";

export async function generateMetadata(blogContent) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const prompt = `
You are an SEO expert for a premium pet brand.

From the blog content below, generate:
1. A short excerpt (max 160 characters)
2. A meta description (max 155 characters)
3. 5 SEO-friendly tags (lowercase, comma separated)

Respond ONLY in valid JSON with this structure:
{
  "excerpt": "...",
  "metaDescription": "...",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

Blog content:
"""
${blogContent.slice(0, 8000)}
"""
`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`,
    {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    },
    {
      headers: {
        "Content-Type": "application/json"
      },
      params: {
        key: process.env.GEMINI_API_KEY
      }
    }
  );

  const text =
    response.data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Empty response from Gemini");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from Gemini:\n${text}`);
  }
}
