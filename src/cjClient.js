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
 * CJ API call with 429 retry
 */
async function cjCall(fn, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err.response?.status === 429 && attempt < retries) {
        const wait = (attempt + 1) * 10;
        console.log(`    ⏳ Rate limited. Waiting ${wait}s...`);
        await new Promise(r => setTimeout(r, wait * 1000));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Get full product details (variants, images, etc.)
 * Use features=enable_inventory to get stock data inline
 */
export async function getProductDetails(pid) {
  const res = await cjCall(() =>
    cj.get("/product/query", {
      params: { pid, countryCode: "US", features: "enable_inventory" }
    })
  );

  if (!res.data.result) {
    return null;
  }

  return res.data.data;
}

/**
 * Check US warehouse inventory for a product
 * Returns total US stock count, or 0 if no US stock
 */
export async function getUSInventory(pid) {
  try {
    const res = await cjCall(() =>
      cj.get("/product/stock/getInventoryByPid", { params: { pid } })
    );

    if (!res.data.result && !res.data.success) return 0;

    const data = res.data.data;
    if (!data) return 0;

    // Check top-level inventories for US warehouse
    const inventories = data.inventories || [];
    let usStock = 0;

    for (const inv of inventories) {
      if (inv.countryCode === "US") {
        usStock += (inv.totalInventoryNum || 0);
      }
    }

    // Also check variant-level inventories
    const variantInvs = data.variantInventories || [];
    for (const vi of variantInvs) {
      for (const inv of (vi.inventory || [])) {
        if (inv.countryCode === "US") {
          usStock = Math.max(usStock, inv.totalInventory || 0);
        }
      }
    }

    return usStock;
  } catch (err) {
    console.log(`    ⚠️ Inventory check failed: ${err.message}`);
    return -1; // Unknown — don't reject
  }
}

/**
 * Get variant details with proper names (variantKey has "Color-Size" format)
 */
export async function getVariants(pid) {
  try {
    const res = await cjCall(() =>
      cj.get("/product/variant/query", {
        params: { pid, countryCode: "US" }
      })
    );

    if (!res.data.result) return [];
    return res.data.data || [];
  } catch (err) {
    return [];
  }
}

/**
 * Search products using V1 endpoint with inventory filter
 * V1 has startInventory param to only return in-stock products
 */
async function searchV1(keyword, page = 1, pageSize = 20) {
  const res = await cjCall(() =>
    cj.get("/product/list", {
      params: {
        productNameEn: keyword,
        pageNum: page,
        pageSize: pageSize,
        countryCode: "US",
        startInventory: 1,       // Only products with stock >= 1
        verifiedWarehouse: 1,    // Verified warehouses only
        sort: "desc",
        orderBy: "listedNum"     // Sort by popularity
      }
    })
  );

  if (!res.data.result) return [];
  return res.data.data?.list || [];
}

/**
 * Search products using V2 endpoint
 */
async function searchV2(keyword, page = 1, size = 20) {
  const res = await cjCall(() =>
    cj.get("/product/listV2", {
      params: {
        keyWord: keyword,
        page: page,
        size: size,
        countryCode: "US",
        orderBy: 4,    // Sort by INVENTORY (most stock first)
        sort: "desc"
      }
    })
  );

  if (!res.data.result) return [];
  return res.data.data?.list || [];
}

/**
 * Search with both endpoints, merge results
 */
async function searchProducts(keyword) {
  let results = [];

  // Try V1 first (has startInventory filter)
  try {
    results = await searchV1(keyword, 1, 15);
    if (results.length > 0) return results;
  } catch (err) {
    if (err.response?.status === 429) throw err;
  }

  // Fallback to V2
  try {
    results = await searchV2(keyword, 1, 15);
  } catch (err) {
    if (err.response?.status === 429) throw err;
  }

  return results;
}

/**
 * MAIN: Search pet products, verify US inventory, return only available ones
 *
 * Flow:
 * 1. Search CJ across pet categories (V1 with inventory filter)
 * 2. For each unique product, check US warehouse inventory via API
 * 3. Get product details (images, variants) for verified products
 * 4. Return only products with US stock + images + details
 */
export async function searchPetProducts() {
  await getAccessToken();

  const categories = [
    "dog toy", "cat toy", "pet toy",
    "dog harness", "dog leash", "retractable leash",
    "dog clothes", "pet clothes", "dog jacket",
    "pet water fountain", "pet feeder", "dog bowl",
    "dog carrier", "dog backpack", "pet carrier",
    "cat scratching post", "cat tree",
    "dog collar", "pet collar",
    "dog bed", "pet bed", "cat bed",
    "pet grooming", "dog brush",
    "dog anxiety vest", "pet puzzle toy", "slow feeder",
    "pooper scooper", "pet safety"
  ];

  const allProducts = [];
  const seenIds = new Set();

  // STEP 1: Search across categories
  console.log("  Step 1: Searching CJ product catalog...");
  for (const keyword of categories) {
    try {
      process.stdout.write(`    "${keyword}"... `);
      const products = await searchProducts(keyword);

      let added = 0;
      for (const p of products) {
        if (!seenIds.has(p.pid)) {
          const price = parseFloat(p.sellPrice || 0);
          if (price >= 1 && price <= 30 && p.productNameEn) {
            seenIds.add(p.pid);
            allProducts.push(p);
            added++;
          }
        }
      }
      console.log(added > 0 ? `${added} new` : "0 new");

      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.log(`failed: ${err.message}`);
      if (err.response?.status === 429) {
        console.log("    Rate limited. Waiting 15s...");
        await new Promise(r => setTimeout(r, 15000));
      }
    }
  }

  console.log(`\n  Step 2: Verifying US inventory for ${allProducts.length} candidates...`);

  // STEP 2: Check US inventory via API (NOT webpage scraping)
  const validProducts = [];

  for (const p of allProducts) {
    try {
      process.stdout.write(`    ${p.productNameEn.substring(0, 55)}... `);

      // Check US warehouse stock
      const usStock = await getUSInventory(p.pid);

      if (usStock === 0) {
        console.log("❌ no US stock");
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }

      // Get full details (images, variants)
      const details = await getProductDetails(p.pid);
      if (!details || !details.productImage) {
        console.log("❌ no images");
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }

      // Cache details for later use during import
      p._cachedDetails = details;
      p._usStock = usStock;
      validProducts.push(p);
      console.log(`✅ (${usStock > 0 ? usStock + " in US" : "available"})`);

      await new Promise(r => setTimeout(r, 1500));

      // Stop after 20 valid products (enough for AI to pick 5)
      if (validProducts.length >= 20) {
        console.log("    Found 20 verified products — enough for selection");
        break;
      }
    } catch (err) {
      console.log(`⚠️ ${err.message}`);
      if (err.response?.status === 429) {
        console.log("    Rate limited. Waiting 15s...");
        await new Promise(r => setTimeout(r, 15000));
      }
    }
  }

  console.log(`\n  Result: ${validProducts.length} products verified with US stock`);
  return validProducts;
}
