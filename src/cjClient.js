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
 * Search CJ products — tries V2 with progressive filters, then legacy fallback
 */
async function searchProducts(keyword, page = 1, size = 20) {
  // Try V2 with different filter levels
  const filterLevels = [
    { countryCode: "US", startWarehouseInventory: 1, verifiedWarehouse: 1 },
    { countryCode: "US", startWarehouseInventory: 1 },
    { countryCode: "US" }
  ];

  for (let i = 0; i < filterLevels.length; i++) {
    try {
      const res = await cjCallWithRetry(() =>
        cj.get("/product/listV2", {
          params: {
            keyWord: keyword, page, size,
            orderBy: 3, sort: "desc",
            ...filterLevels[i]
          }
        })
      );
      if (res.data.result) {
        const list = res.data.data?.list || [];
        if (list.length > 0) {
          if (i > 0) console.log(`    (filter level ${i + 1})`);
          return list;
        }
      }
    } catch (err) {
      if (err.response?.status === 429) throw err;
    }
  }

  // Legacy fallback
  try {
    const res = await cjCallWithRetry(() =>
      cj.get("/product/list", {
        params: { productNameEn: keyword, pageNum: page, pageSize: size, countryCode: "US" }
      })
    );
    if (res.data.result) {
      const list = res.data.data?.list || [];
      if (list.length > 0) {
        console.log(`    (legacy endpoint)`);
        return list;
      }
    }
  } catch (err) { /* ignore */ }

  return [];
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      validateStatus: () => true
    });

    const html = typeof response.data === "string" ? response.data : "";

    // Check for "Product removed" message
    if (html.includes("Product removed") || html.includes("product removed") ||
        html.includes("Product Removed") || html.includes("sourcing request")) {
      return false;
    }

    if (response.status === 404 || response.status >= 500) {
      return false;
    }

    return true;
  } catch (err) {
    console.log(`    ⚠️ Could not check CJ page: ${err.message}`);
    return false; // If we can't verify, skip it — safer
  }
}

/**
 * MAIN SEARCH: Find pet products, validate each, return only AVAILABLE ones
 * Flow: Search CJ → Check each product's webpage → Return only live products
 */
export async function searchPetProducts() {
  await getAccessToken();

  const categories = [
    "dog toy", "cat toy", "pet toy",
    "dog harness", "dog leash", "retractable leash",
    "dog clothes", "pet clothes", "dog jacket",
    "pet water fountain", "pet feeder", "dog bowl",
    "dog carrier", "dog backpack", "pet carrier bag",
    "cat scratching post", "cat tree", "cat toy interactive",
    "dog collar", "pet collar", "airtag collar",
    "dog bed", "pet bed", "cat bed",
    "pet grooming", "dog brush", "pet nail clipper",
    "dog anxiety vest", "pet puzzle toy", "slow feeder",
    "pooper scooper", "pet safety", "dog muzzle"
  ];

  const allProducts = [];
  const seenIds = new Set();

  // STEP 1: Search across all categories
  console.log("  Step 1: Searching CJ across categories...");
  for (const keyword of categories) {
    try {
      console.log(`    "${keyword}"...`);
      const products = await searchProducts(keyword, 1, 15);

      let added = 0;
      for (const p of products) {
        if (!seenIds.has(p.pid)) {
          const price = parseFloat(p.sellPrice || 0);
          // Basic price filter — only products $1-$30
          if (price >= 1 && price <= 30 && p.productNameEn) {
            seenIds.add(p.pid);
            allProducts.push(p);
            added++;
          }
        }
      }
      if (added > 0) console.log(`      → ${added} new candidates`);

      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.warn(`    Failed: ${err.message}`);
      if (err.response?.status === 429) {
        console.log("    Rate limited. Waiting 15s...");
        await new Promise(r => setTimeout(r, 15000));
      }
    }
  }

  console.log(`\n  Step 2: Found ${allProducts.length} candidates. Validating availability...`);

  // STEP 2: Validate each product on CJ website
  // This is the KEY step — removes discontinued/removed products
  const validProducts = [];

  for (const p of allProducts) {
    try {
      process.stdout.write(`    Checking: ${p.productNameEn.substring(0, 50)}... `);
      const available = await isProductAvailable(p.pid);

      if (available) {
        // Also get details to confirm images exist
        const details = await getProductDetails(p.pid);
        if (details && details.productImage) {
          p._cachedDetails = details;
          validProducts.push(p);
          console.log("✅");
        } else {
          console.log("❌ no images");
        }
      } else {
        console.log("❌ removed");
      }

      // 3s between checks to avoid rate limits
      await new Promise(r => setTimeout(r, 3000));

      // If we have enough valid products, stop checking (save API calls)
      if (validProducts.length >= 20) {
        console.log(`    ✅ Found 20 valid products — enough for selection`);
        break;
      }
    } catch (err) {
      console.log(`❌ error: ${err.message}`);
      if (err.response?.status === 429) {
        console.log("    Rate limited. Waiting 15s...");
        await new Promise(r => setTimeout(r, 15000));
      }
    }
  }

  console.log(`\n  Result: ${validProducts.length} verified available products from ${allProducts.length} candidates`);
  return validProducts;
}
