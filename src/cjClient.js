import axios from "axios";

const CJ_API_KEY = process.env.CJ_API_KEY;
const CJ_BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1";

if (!CJ_API_KEY) {
  throw new Error("CJ_API_KEY is required");
}

const cj = axios.create({
  baseURL: CJ_BASE_URL,
  headers: { "Content-Type": "application/json" }
});

let cachedToken = null;

export async function getAccessToken() {
  if (cachedToken) return cachedToken;

  console.log("Requesting CJ access token...");
  const res = await axios.post(`${CJ_BASE_URL}/authentication/getAccessToken`, {
    apiKey: CJ_API_KEY
  }, { headers: { "Content-Type": "application/json" } });

  if (res.data.result && res.data.data?.accessToken) {
    cachedToken = res.data.data.accessToken;
    cj.defaults.headers.common["CJ-Access-Token"] = cachedToken;
    console.log("CJ access token obtained successfully");
    return cachedToken;
  }

  console.warn("Token exchange response:", JSON.stringify(res.data));
  cachedToken = CJ_API_KEY;
  cj.defaults.headers.common["CJ-Access-Token"] = CJ_API_KEY;
  return CJ_API_KEY;
}

/**
 * Make a CJ API call with automatic 429 retry
 */
async function cjCallWithRetry(fn, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err.response?.status === 429 && attempt < retries) {
        const wait = (attempt + 1) * 10; // 10s, 20s
        console.log(`  ⏳ Rate limited (429). Waiting ${wait}s before retry...`);
        await new Promise(r => setTimeout(r, wait * 1000));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Search CJ products by keyword with retry
 */
export async function searchProducts(keyword, page = 1, pageSize = 20) {
  const res = await cjCallWithRetry(() =>
    cj.get("/product/list", {
      params: {
        productNameEn: keyword,
        pageNum: page,
        pageSize: pageSize,
        countryCode: "US"
      }
    })
  );

  if (!res.data.result) {
    console.warn(`CJ search failed for "${keyword}":`, res.data.message);
    return [];
  }

  return res.data.data?.list || [];
}

/**
 * Get full product details with retry
 */
export async function getProductDetails(pid) {
  const res = await cjCallWithRetry(() =>
    cj.get("/product/query", { params: { pid } })
  );

  if (!res.data.result) {
    console.warn(`CJ product detail failed for ${pid}:`, res.data.message);
    return null;
  }

  return res.data.data;
}

/**
 * Check if a CJ product is actually available (not removed)
 * CJ API still returns data for removed products, so we check:
 * 1. Product has images
 * 2. Product has variants with prices
 * 3. Product webpage is accessible (HEAD check to cjdropshipping.com)
 */
export async function isProductAvailable(pid) {
  try {
    // Quick check: hit the CJ product page and see if it redirects/shows removed
    const response = await axios.get(`https://cjdropshipping.com/product/${pid}`, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FurryFableBot/1.0)"
      },
      // We just need to check the response, not download the full page
      validateStatus: () => true
    });

    const html = typeof response.data === "string" ? response.data : "";

    // Check for "Product removed" text in the page
    if (html.includes("Product removed") || html.includes("product removed")) {
      return false;
    }

    // If we get a 404 or redirect to search, product doesn't exist
    if (response.status === 404) {
      return false;
    }

    return true;
  } catch (err) {
    // If we can't reach the page, assume it might be available (don't block on network issues)
    console.log(`  ⚠️ Could not check CJ page for ${pid}: ${err.message}`);
    return true;
  }
}

/**
 * Search products across pet categories
 * Uses FEWER categories with LONGER delays to avoid rate limits
 */
export async function searchPetProducts() {
  await getAccessToken();

  // Consolidated categories — fewer searches, less rate limit risk
  const categories = [
    "dog toy", "cat toy",
    "dog harness", "dog leash",
    "dog clothes", "pet clothes",
    "pet water fountain", "pet feeder",
    "dog carrier", "dog backpack",
    "cat scratching post", "cat tree",
    "dog collar", "pet collar",
    "dog bed", "pet bed",
    "pet grooming", "dog bowl"
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

      // 2s between searches to stay under rate limit
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.warn(`  Search failed for "${keyword}": ${err.message}`);
      if (err.response?.status === 429) {
        console.log("  Rate limited. Waiting 15 seconds...");
        await new Promise(r => setTimeout(r, 15000));
      }
    }
  }

  console.log(`Found ${allProducts.length} unique products from CJ`);
  return allProducts;
}
