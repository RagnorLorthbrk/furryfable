import axios from "axios";

const CJ_API_KEY = process.env.CJ_API_KEY;
const CJ_BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1";

if (!CJ_API_KEY) {
  throw new Error("CJ_API_KEY is required");
}

// Start with no auth — we'll get a proper token first
const cj = axios.create({
  baseURL: CJ_BASE_URL,
  headers: {
    "Content-Type": "application/json"
  }
});

/**
 * Get access token from CJ using the API key
 * CJ requires POST with apiKey in body to exchange for access token
 */
let cachedToken = null;

export async function getAccessToken() {
  if (cachedToken) return cachedToken;

  console.log("Requesting CJ access token...");

  // CJ API v2.0: POST to get access token
  const res = await axios.post(`${CJ_BASE_URL}/authentication/getAccessToken`, {
    apiKey: CJ_API_KEY
  }, {
    headers: { "Content-Type": "application/json" }
  });

  if (res.data.result && res.data.data?.accessToken) {
    cachedToken = res.data.data.accessToken;
    cj.defaults.headers.common["CJ-Access-Token"] = cachedToken;
    console.log("CJ access token obtained successfully");
    return cachedToken;
  }

  // If token exchange fails, try using the API key directly
  console.warn("Token exchange response:", JSON.stringify(res.data));
  cachedToken = CJ_API_KEY;
  cj.defaults.headers.common["CJ-Access-Token"] = CJ_API_KEY;
  return CJ_API_KEY;
}

/**
 * Search CJ products by category keyword
 * Filters to USA warehouse only
 */
export async function searchProducts(keyword, page = 1, pageSize = 20) {
  const res = await cj.get("/product/list", {
    params: {
      productNameEn: keyword,
      pageNum: page,
      pageSize: pageSize,
      countryCode: "US"
    }
  });

  if (!res.data.result) {
    console.warn(`CJ search failed for "${keyword}":`, res.data.message);
    return [];
  }

  return res.data.data?.list || [];
}

/**
 * Get full product details including variants and images
 */
export async function getProductDetails(pid) {
  const res = await cj.get("/product/query", {
    params: { pid }
  });

  if (!res.data.result) {
    console.warn(`CJ product detail failed for ${pid}:`, res.data.message);
    return null;
  }

  return res.data.data;
}

/**
 * Get product variants with pricing
 */
export async function getProductVariants(pid) {
  const product = await getProductDetails(pid);
  if (!product) return [];

  return (product.variants || []).map(v => ({
    variantId: v.vid,
    name: v.variantNameEn || v.variantName || "",
    sellPrice: parseFloat(v.variantSellPrice || v.sellPrice || 0),
    image: v.variantImage || product.productImage,
    sku: v.variantSku || "",
    weight: v.variantWeight || 0,
    stock: v.variantVolume || 0
  }));
}

/**
 * Search products across multiple pet categories
 * Returns a flat list of unique products from USA warehouse
 */
export async function searchPetProducts() {
  // Authenticate first — single token request
  await getAccessToken();

  const categories = [
    "pet toy", "dog toy", "cat toy",
    "pet harness", "dog harness", "dog leash",
    "pet clothes", "dog clothes", "dog sweater", "dog jacket",
    "pet feeder", "dog water bottle", "cat feeder",
    "pet carrier", "dog backpack", "dog car seat",
    "cat scratching", "cat tower", "cat tree",
    "pet collar", "dog collar", "airtag pet",
    "dog anxiety vest", "pet puzzle toy",
    "dog frisbee", "pet grooming",
    "pet bed", "dog bed", "cat bed",
    "pet bowl", "dog bowl",
    "pooper scooper", "poop bag",
    "pet safety", "dog muzzle",
    "retractable leash", "reflective leash"
  ];

  const allProducts = [];
  const seenIds = new Set();

  for (const keyword of categories) {
    try {
      console.log(`  Searching: "${keyword}"...`);
      const products = await searchProducts(keyword, 1, 10);

      for (const p of products) {
        if (!seenIds.has(p.pid)) {
          seenIds.add(p.pid);
          allProducts.push(p);
        }
      }

      // Rate limiting — CJ API has limits
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.warn(`  Search failed for "${keyword}": ${err.message}`);
      // If 429 rate limit, wait longer
      if (err.response?.status === 429) {
        console.log("  Rate limited. Waiting 5 seconds...");
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  console.log(`Found ${allProducts.length} unique products from CJ`);
  return allProducts;
}
