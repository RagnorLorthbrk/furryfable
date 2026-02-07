import axios from "axios";

export async function updateShopifyMetadata(slug, metadata) {
  const {
    SHOPIFY_STORE_DOMAIN,
    SHOPIFY_ACCESS_TOKEN,
    SHOPIFY_API_VERSION
  } = process.env;

  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN || !SHOPIFY_API_VERSION) {
    throw new Error("Missing Shopify environment variables");
  }

  const baseUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`;

  // 1. Find article by handle
  const articleRes = await axios.get(
    `${baseUrl}/articles.json?handle=${slug}`,
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN
      }
    }
  );

  const article = articleRes.data?.articles?.[0];

  if (!article) {
    throw new Error(`Shopify article not found for slug: ${slug}`);
  }

  // 2. Update metadata only
  await axios.put(
    `${baseUrl}/articles/${article.id}.json`,
    {
      article: {
        id: article.id,
        excerpt: metadata.excerpt,
        tags: metadata.tags.join(", "),
        metafields: [
          {
            namespace: "global",
            key: "description_tag",
            type: "single_line_text_field",
            value: metadata.metaDescription
          }
        ]
      }
    },
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    }
  );
}
