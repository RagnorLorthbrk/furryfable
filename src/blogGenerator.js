import axios from "axios";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "models/gemini-2.5-flash";

export async function generateBlogHTML(topic) {
  const prompt = `
You are a professional SEO content writer.

Write a high-quality blog post about:
"${topic}"

Rules:
- Let length be decided naturally
- Proper H1, H2, H3 structure
- Clean HTML only (no markdown)
- Human, non-AI tone
- Add internal linking suggestions where relevant
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }]
    }
  );

  return res.data.candidates[0].content.parts[0].text;
}
