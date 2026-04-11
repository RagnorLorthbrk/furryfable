import axios from "axios";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN, SHOPIFY_API_VERSION = "2026-01" } = process.env;

const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

/**
 * Fetch all products from Shopify
 */
async function fetchAllProducts() {
  const products = [];
  let nextPageUrl = `/products.json?limit=250`;

  while (nextPageUrl) {
    const res = await shopify.get(nextPageUrl);
    products.push(...res.data.products);

    // Check for pagination
    const linkHeader = res.headers.link || "";
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    if (nextMatch) {
      nextPageUrl = nextMatch[1].replace(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`, "");
    } else {
      nextPageUrl = null;
    }
  }

  return products;
}

/**
 * Analyze a product and generate SEO-optimized content
 */
async function generateProductSeo(product) {
  const currentTitle = product.title;
  const currentDescription = product.body_html || "";
  const currentTags = product.tags || "";
  const variants = product.variants || [];
  const images = product.images || [];
  const productType = product.product_type || "";
  const vendor = product.vendor || "";

  const prompt = `
You are a Shopify SEO expert for FurryFable.com (premium pet products, USA & Canada).

CURRENT PRODUCT DATA:
- Title: "${currentTitle}"
- Type: "${productType}"
- Vendor: "${vendor}"
- Tags: "${currentTags}"
- Variants: ${variants.length} (${variants.map(v => v.title).join(", ")})
- Images: ${images.length}
- Current Description: "${currentDescription.replace(/<[^>]+>/g, "").slice(0, 500)}"

OPTIMIZE THIS PRODUCT FOR:
1. Google Shopping / Product search
2. AI engines (ChatGPT, Gemini, Perplexity, Claude)
3. On-site conversion (compelling description that sells)

RULES:
- Title: Keep it under 70 chars, include primary keyword, brand can stay
- Description: Write compelling HTML (300-500 words) with:
  - Opening hook (why this product solves a problem)
  - Key features as bullet points
  - Materials/specs if inferable
  - Use case scenarios (when/where to use)
  - Trust signals ("Premium quality", "Designed for comfort")
  - End with a subtle CTA
- SEO Title: Optimized page title for Google (max 60 chars)
- Meta Description: Click-worthy, max 155 chars, includes keyword + value prop
- Tags: 8-12 relevant tags for Shopify search and collections

Respond ONLY in valid JSON:
{
  "optimizedTitle": "SEO-optimized product title",
  "seoTitle": "Page title for Google (meta title)",
  "metaDescription": "155-char meta description with keyword and CTA",
  "bodyHtml": "Full HTML product description (300-500 words)",
  "tags": "tag1, tag2, tag3, tag4, tag5, tag6, tag7, tag8",
  "imageAltTexts": ["descriptive alt text for image 1", "alt text for image 2"],
  "needsUpdate": true
}

Set "needsUpdate" to false ONLY if the current title/description are already well-optimized.
No markdown wrapping. Valid JSON only.
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4 }
    }
  );

  const text = res.data.candidates[0].content.parts[0].text;
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

/**
 * Update a product on Shopify with optimized SEO data
 */
async function updateProduct(productId, seoData, images) {
  const updatePayload = {
    product: {
      id: productId,
      title: seoData.optimizedTitle,
      body_html: seoData.bodyHtml,
      tags: seoData.tags
    }
  };

  // Update product
  await shopify.put(`/products/${productId}.json`, updatePayload);

  // Update image alt texts
  if (seoData.imageAltTexts && images.length > 0) {
    for (let i = 0; i < Math.min(images.length, seoData.imageAltTexts.length); i++) {
      try {
        await shopify.put(`/products/${productId}/images/${images[i].id}.json`, {
          image: {
            id: images[i].id,
            alt: seoData.imageAltTexts[i]
          }
        });
      } catch (err) {
        console.error(`  Failed to update alt text for image ${images[i].id}:`, err.message);
      }
    }
  }

  // Set SEO meta title and description via metafields
  const metafields = [
    {
      namespace: "global",
      key: "title_tag",
      value: seoData.seoTitle,
      type: "single_line_text_field"
    },
    {
      namespace: "global",
      key: "description_tag",
      value: seoData.metaDescription,
      type: "single_line_text_field"
    }
  ];

  for (const metafield of metafields) {
    try {
      await shopify.post(`/products/${productId}/metafields.json`, { metafield });
    } catch (err) {
      // If metafield exists, update it
      if (err.response?.status === 422) {
        try {
          const existing = await shopify.get(`/products/${productId}/metafields.json`);
          const match = existing.data.metafields.find(
            m => m.namespace === metafield.namespace && m.key === metafield.key
          );
          if (match) {
            await shopify.put(`/metafields/${match.id}.json`, {
              metafield: { ...metafield, id: match.id }
            });
          }
        } catch (updateErr) {
          console.error(`  Failed to update metafield ${metafield.key}:`, updateErr.message);
        }
      }
    }
  }
}

// Main execution
console.log("Starting Shopify Product SEO Optimizer...");

const products = await fetchAllProducts();
console.log(`Found ${products.length} products to audit`);

let updated = 0;
let skipped = 0;

for (const product of products) {
  console.log(`\nAnalyzing: "${product.title}" (ID: ${product.id})`);

  try {
    const seoData = await generateProductSeo(product);

    if (!seoData.needsUpdate) {
      console.log("  Already optimized. Skipping.");
      skipped++;
      continue;
    }

    console.log(`  Optimizing: "${product.title}" -> "${seoData.optimizedTitle}"`);
    console.log(`  SEO Title: ${seoData.seoTitle}`);
    console.log(`  Meta: ${seoData.metaDescription}`);

    await updateProduct(product.id, seoData, product.images || []);

    updated++;
    console.log(`  Updated successfully.`);

    // Rate limiting - Shopify allows 2 requests/second
    await new Promise(r => setTimeout(r, 1000));
  } catch (err) {
    console.error(`  Error optimizing "${product.title}":`, err.message);
  }
}

console.log(`\nProduct SEO Optimization Complete:`);
console.log(`  Updated: ${updated}`);
console.log(`  Skipped: ${skipped}`);
console.log(`  Total: ${products.length}`);
