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
        const wait = (attempt + 1) * 10;
        console.log(`  ⏳ Rate limited (429). Waiting ${wait}s before retry...`);
        await new Promise(r => setTimeout(r, wait * 1000));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Search CJ products using the V2 endpoint (Elasticsearch-powered)
 * Key filters:
 *   - countryCode=US → only USA warehouse products
 *   - startWarehouseInventory=1 → only IN-STOCK products
 *   - verifiedWarehouse=1 → only verified warehouses (reliable stock)
 *   - orderBy=3, sort=desc → newest first
 */
export async function searchProductsV2(keyword, page = 1, size = 20) {
  const res = await cjCallWithRetry(() =>
    cj.get("/product/listV2", {
      params: {
        keyWord: keyword,
        page: page,
        size: size,
        countryCode: "US",
        startWarehouseInventory: 1,  // Must have stock
        verifiedWarehouse: 1,        // Verified warehouse only
        orderBy: 3,                  // Sort by create time
        sort: "desc"                 // Newest first
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
 * Hits the actual CJ product webpage to verify
 */
export async function isProductAvailable(pid) {
  try {
    const response = await axios.get(`https://cjdropshipping.com/product/${pid}`, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FurryFableBot/1.0)"
      },
      validateStatus: () => true
    });

    const html = typeof response.data === "string" ? response.data : "";

    if (html.includes("Product removed") || html.includes("product removed")) {
      return false;
    }

    if (response.status === 404) {
      return false;
    }

    return true;
  } catch (err) {
    console.log(`  ⚠️ Could not check CJ page for ${pid}: ${err.message}`);
    return true; // Don't block on network issues
  }
}

/**
 * Search products across pet categories
 * Uses V2 endpoint with in-stock + verified warehouse filters
 */
export async function searchPetProducts() {
  await getAccessToken();

  // Focused pet categories — fewer but more targeted
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
      const products = await searchProductsV2(keyword, 1, 15);

      let added = 0;
      for (const p of products) {
        if (!seenIds.has(p.pid)) {
          seenIds.add(p.pid);
          allProducts.push(p);
          added++;
        }
      }
      if (added > 0) console.log(`    → ${added} new products`);

      // 2s between searches
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.warn(`  Search failed for "${keyword}": ${err.message}`);
      if (err.response?.status === 429) {
        console.log("  Rate limited. Waiting 15 seconds...");
        await new Promise(r => setTimeout(r, 15000));
      }
    }
  }

  console.log(`Found ${allProducts.length} unique in-stock products from CJ (US warehouse, verified)`);
  return allProducts;
}
