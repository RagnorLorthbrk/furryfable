import axios from "axios";

const MODEL = "models/gemini-2.5-flash";

export async function generateBlogHTML(title, keyword) {
  const prompt = `
Write a long-form SEO blog in VALID HTML ONLY.

Title: ${title}
Primary keyword: ${keyword}

Rules:
- No markdown
- Use <h1>, <h2>, <p>, <ul>
- Clean formatting
- No emojis
- No inline styles
- No weird spacing
- Natural internal linking suggestions
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }]
    }
  );

  return res.data.candidates[0].content.parts[0].text;
}
