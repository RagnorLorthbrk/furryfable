import axios from "axios";

function extractHTML(text) {
  const match = text.match(/<html[\s\S]*<\/html>/i);
  return match ? match[0] : text;
}

export async function generateBlog({
  title,
  primaryKeyword
}) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY missing at runtime");
  }

  const prompt = `
You are a senior SEO content writer for a premium pet products brand.

Brand: FurryFable
Website: https://www.furryfable.com
Audience: Pet owners in USA & Canada
Niche: Dogs and cats only

BLOG GOAL:
Write the best possible blog for ranking and user trust.

CONTENT RULES:
- Decide the optimal length based on topic and search intent
- Do NOT force word count
- Prioritize depth, clarity, and usefulness
- Use natural language (no AI tone)
- Avoid keyword stuffing
- Write for humans first, SEO second

STRUCTURE REQUIREMENTS:
- One <h1> using the title
- Logical <h2> and <h3> sections
- Bullet points where helpful
- Short paragraphs (2–4 lines)

INTERNAL LINKING (VERY IMPORTANT):
Naturally add contextual links where relevant to:
- Homepage: https://www.furryfable.com
- Relevant collections (example paths):
  - https://www.furryfable.com/collections/dog-products
  - https://www.furryfable.com/collections/cat-products
  - https://www.furryfable.com/collections/pet-accessories
- Other related blog posts (generic references allowed)

LINKING RULES:
- Links must feel editorial, not forced
- Do NOT overlink
- Use descriptive anchor text (not "click here")

TOPIC DETAILS:
Title: ${title}
Primary keyword: ${primaryKeyword}

OUTPUT FORMAT:
- Return ONLY valid HTML
- No markdown
- No explanations
- No backticks
- HTML must be Shopify-ready

Begin now.
`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    }
  );

  const raw =
    response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!raw) {
    throw new Error("Empty blog response from Gemini");
  }

  return extractHTML(raw);
}
