import axios from "axios";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "models/gemini-2.5-flash";

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY missing");
}

export async function generateBlogHTML(topic) {
  const prompt = `
You are a professional SEO content writer.

Write a high-quality blog post about:
"${topic}"

Rules:
- Decide content length naturally (SEO best practice)
- Use H1, H2, H3 properly
- Clean human tone
- Suggest internal links naturally
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
