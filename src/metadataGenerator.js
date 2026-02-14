import axios from "axios";

export async function generateMetadata(blogContent) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  // Updated to the current stable model to avoid 404 errors
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
You are an SEO expert for a premium pet brand.
From the blog content below, generate:
1. A short excerpt (max 160 characters)
2. A meta description (max 155 characters)
3. 5 SEO-friendly tags (lowercase)

Respond ONLY in valid JSON:
{
  "excerpt": "...",
  "metaDescription": "...",
  "tags": ["tag1","tag2","tag3","tag4","tag5"]
}

Blog content:
${blogContent.slice(0, 8000)}
`;

  const response = await axios.post(url, {
    contents: [{ parts: [{ text: prompt }] }]
  });

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini Metadata Generator");

  try {
    // Cleans potential markdown formatting before parsing
    const cleanJson = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    throw new Error(`Invalid JSON from Gemini: ${text}`);
  }
}
