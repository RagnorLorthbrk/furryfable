import axios from "axios";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "models/gemini-2.5-flash";

export async function generateBlogHTML(title) {
  const prompt = `
Write a long-form, high-quality Shopify blog article.

Rules:
- VALID HTML ONLY
- Use <h2>, <h3>, <p>, <ul>, <li>
- NO markdown
- NO emojis
- Natural spacing between sections
- SEO-friendly
- Conversational, human tone
- Do NOT mention AI
- No inline styles

Topic:
"${title}"
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }]
    }
  );

  return res.data.candidates[0].content.parts[0].text;
}
