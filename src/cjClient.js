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
 * Get full product details via CJ API
 */
export async function getProductDetails(pid) {
  const res = await cjCall(() =>
    cj.get("/product/query", {
      params: { pid, countryCode: "US", features: "enable_inventory" }
    })
  );

  if (!res.data.result) return null;
  return res.data.data;
}

// ═══════════════════════════════════════
// METHOD 1: API with saleStatus=3
// (Approved for sale — filters out removed/archived products)
// ═══════════════════════════════════════

/**
 * Search via /product/listV2 with saleStatus=3 (approved for sale)
 * This is the key filter that matches CJ website's live catalog
 */
async function searchAPIv2(categoryId, page = 1, size = 100) {
  // Try GET first (per CJ docs), then POST as fallback
  for (const method of ["get", "post"]) {
    try {
      const params = {
        categoryId: categoryId,
        countryCode: "US",
        saleStatus: "3",           // KEY: Only "Approved for Sale" products
        verifiedWarehouse: 1,
        pageNum: page,
        pageSize: size,
        page: page,                // V2 uses 'page' not 'pageNum'
        size: size,                // V2 uses 'size' not 'pageSize'
        orderBy: 1,                // Sort by listings (popularity)
        sort: "desc"
      };

      let res;
      if (method === "get") {
        res = await cjCall(() => cj.get("/product/listV2", { params }));
      } else {
        res = await cjCall(() => cj.post("/product/listV2", params));
      }

      if (res.data.result) {
        const list = res.data.data?.list || [];
        if (list.length > 0) {
          console.log(`    ✅ listV2 (${method.toUpperCase()}) with saleStatus=3 returned ${list.length} products`);
          return list;
        }
      }
    } catch (err) {
      if (err.response?.status === 429) throw err;
      // Try next method
    }
  }
  return [];
}

/**
 * Search via /product/list (V1) with startInventory filter
 */
async function searchAPIv1(categoryId, page = 1, pageSize = 100) {
  try {
    const res = await cjCall(() =>
      cj.get("/product/list", {
        params: {
          categoryId: categoryId,
          countryCode: "US",
          startInventory: 1,
          verifiedWarehouse: 1,
          pageNum: page,
          pageSize: pageSize,
          sort: "desc",
          orderBy: "listedNum"
        }
      })
    );

    if (res.data.result) {
      const list = res.data.data?.list || [];
      if (list.length > 0) {
        console.log(`    ✅ list V1 with startInventory=1 returned ${list.length} products`);
        return list;
      }
    }
  } catch (err) {
    if (err.response?.status === 429) throw err;
  }
  return [];
}

// ═══════════════════════════════════════
// METHOD 2: Website scraping (fallback)
// Extracts window.PRODUCTSRES from HTML
// ═══════════════════════════════════════

async function scrapeProductsFromWebsite(page = 1) {
  const searchUrl = `https://cjdropshipping.com/list/wholesale-pet-supplies-l-2409110611570657700.html?pageNum=${page}&from=US&shipTo=US&defaultArea=2`;

  const response = await axios.get(searchUrl, {
    timeout: 20000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5"
    }
  });

  const html = typeof response.data === "string" ? response.data : "";

  // Find PRODUCTSRES in HTML (format: PRODUCTSRES={...})
  let startIdx = html.indexOf('PRODUCTSRES={');
  if (startIdx === -1) startIdx = html.indexOf('PRODUCTSRES ={');
  if (startIdx === -1) startIdx = html.indexOf('PRODUCTSRES= {');
  if (startIdx === -1) startIdx = html.indexOf('PRODUCTSRES = {');

  if (startIdx === -1) {
    // Debug: check if PRODUCTSRES exists at all, maybe different format
    const anyIdx = html.indexOf('PRODUCTSRES');
    if (anyIdx !== -1) {
      console.log("    Found PRODUCTSRES but unexpected format:", html.substring(anyIdx, anyIdx + 80));
    }
    return [];
  }

  // Find the opening brace and count to matching close
  const jsonStart = html.indexOf('{', startIdx);
  let depth = 0;
  let jsonEnd = jsonStart;
  for (let i = jsonStart; i < html.length && i < jsonStart + 1000000; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) { jsonEnd = i + 1; break; }
    }
  }

  try {
    const data = JSON.parse(html.substring(jsonStart, jsonEnd));
    const list = data.content?.[0]?.productList || [];
    return list.map(p => ({
      pid: p.id,
      productNameEn: p.nameEn || p.name || "",
      sellPrice: p.sellPrice || p.nowPrice || "0",
      productImage: p.image || p.bigImage || "",
      listedNum: parseInt(p.listedNum) || 0,
      categoryName: p.oneCategoryName || ""
    }));
  } catch (e) {
    console.log("    JSON parse failed:", e.message);
    return [];
  }
}

// ═══════════════════════════════════════
// MAIN SEARCH FUNCTION
// Tries: API saleStatus=3 → API V1 → Website scraping
// ═══════════════════════════════════════

/**
 * Pet Supplies category ID on CJ
 */
const PET_CATEGORY_ID = "2409110611570657700";

/**
 * Pet sub-categories to search if main category works
 */
const PET_SUBCATEGORIES = [
  { name: "Pet Toys", id: null },
  { name: "Pet Drinking & Feeding", id: null },
  { name: "Pet Outdoor Supplies", id: null },
  { name: "Pet Apparels", id: null },
  { name: "Pet Collars & Harnesses", id: null },
  { name: "Pet Groomings", id: null },
  { name: "Pet Furnitures", id: null },
  { name: "Pet Bedding", id: null }
];

export async function searchPetProducts() {
  await getAccessToken();

  const allProducts = [];
  const seenIds = new Set();

  function addProducts(products) {
    let added = 0;
    for (const p of products) {
      const pid = p.pid || p.id;
      const name = p.productNameEn || p.nameEn || p.name || "";
      const price = parseFloat(p.sellPrice || p.nowPrice || 0);
      const image = p.productImage || p.image || p.bigImage || "";
      const listedNum = parseInt(p.listedNum) || 0;

      if (!pid || seenIds.has(pid) || !name) continue;
      if (price < 1 || price > 30) continue;

      seenIds.add(pid);
      allProducts.push({
        pid,
        productNameEn: name,
        sellPrice: String(price),
        productImage: image,
        listedNum
      });
      added++;
    }
    return added;
  }

  // ═══ ATTEMPT 1: API listV2 with saleStatus=3 ═══
  console.log("  Method 1: API listV2 with saleStatus=3 (approved for sale)...");
  try {
    for (let page = 1; page <= 3; page++) {
      const products = await searchAPIv2(PET_CATEGORY_ID, page, 100);
      const added = addProducts(products);
      console.log(`    Page ${page}: ${products.length} returned, ${added} new qualified`);
      if (products.length === 0) break;
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (err) {
    console.log(`    Failed: ${err.message}`);
  }

  if (allProducts.length >= 20) {
    console.log(`\n  ✅ Found ${allProducts.length} products via API (saleStatus=3)`);
    return allProducts;
  }
  console.log(`    Got ${allProducts.length} — trying next method...`);

  // ═══ ATTEMPT 2: API V1 with startInventory ═══
  console.log("\n  Method 2: API list V1 with startInventory=1...");
  try {
    for (let page = 1; page <= 3; page++) {
      const products = await searchAPIv1(PET_CATEGORY_ID, page, 100);
      const added = addProducts(products);
      console.log(`    Page ${page}: ${products.length} returned, ${added} new qualified`);
      if (products.length === 0) break;
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (err) {
    console.log(`    Failed: ${err.message}`);
  }

  if (allProducts.length >= 20) {
    console.log(`\n  ✅ Found ${allProducts.length} products via API V1`);
    return allProducts;
  }
  console.log(`    Got ${allProducts.length} — trying website scraping...`);

  // ═══ ATTEMPT 3: Website scraping (PRODUCTSRES) ═══
  console.log("\n  Method 3: Scraping CJ website (fallback)...");
  try {
    for (let page = 1; page <= 3; page++) {
      process.stdout.write(`    Page ${page}... `);
      const products = await scrapeProductsFromWebsite(page);
      const added = addProducts(products);
      console.log(`${products.length} scraped, ${added} new qualified`);
      if (products.length === 0) break;
      await new Promise(r => setTimeout(r, 3000));
    }
  } catch (err) {
    console.log(`    Failed: ${err.message}`);
  }

  // ═══ ATTEMPT 4: Keyword search with saleStatus (last resort) ═══
  if (allProducts.length < 10) {
    console.log("\n  Method 4: Keyword search with saleStatus=3...");
    const keywords = ["dog toy", "cat toy", "dog harness", "pet feeder", "dog bed", "cat tree", "pet grooming"];
    for (const kw of keywords) {
      try {
        process.stdout.write(`    "${kw}"... `);
        const res = await cjCall(() =>
          cj.get("/product/listV2", {
            params: {
              keyWord: kw,
              countryCode: "US",
              saleStatus: "3",
              page: 1,
              size: 20,
              orderBy: 1,
              sort: "desc"
            }
          })
        );
        if (res.data.result) {
          const list = res.data.data?.list || [];
          const added = addProducts(list);
          console.log(`${list.length} found, ${added} new`);
        } else {
          console.log("no results");
        }
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        console.log(`failed: ${err.message}`);
        if (err.response?.status === 429) {
          await new Promise(r => setTimeout(r, 15000));
        }
      }
      if (allProducts.length >= 30) break;
    }
  }

  // Final filter: only products with listedNum > 0 (other dropshippers use them = truly active)
  const verifiedProducts = allProducts.filter(p => p.listedNum > 0);

  console.log(`\n  Result: ${allProducts.length} total, ${verifiedProducts.length} with listedNum > 0`);

  // Use verified if we have enough, otherwise use all
  return verifiedProducts.length >= 10 ? verifiedProducts : allProducts;
}
