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

/**
 * Scrape LIVE products from CJ Dropshipping WEBSITE (not API)
 *
 * The CJ API returns stale/removed products. The website shows only LIVE products.
 * We scrape the search results page filtered by US warehouse + Pet Supplies category.
 *
 * URL pattern: /search/{keyword}.html?from=US&shipTo=US&defaultArea=2&id={petCategoryId}
 * Product PID extracted from links: /product/{slug}-p-{PID}.html
 */
async function scrapeProductsFromWebsite(page = 1) {
  // Use the Pet Supplies category page filtered by US warehouse — same URL user browses manually
  const searchUrl = `https://cjdropshipping.com/list/wholesale-pet-supplies-l-2409110611570657700.html?pageNum=${page}&from=US&shipTo=US&defaultArea=2`;

  try {
    const response = await axios.get(searchUrl, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      }
    });

    const html = typeof response.data === "string" ? response.data : "";

    // Extract product PIDs from href links: /product/{slug}-p-{PID}.html
    const productLinks = [];
    const linkRegex = /href="\/product\/([^"]+)-p-([^"]+?)\.html"/g;
    let match;

    const seenPids = new Set();
    while ((match = linkRegex.exec(html)) !== null) {
      const slug = match[1];
      const pid = match[2];
      if (!seenPids.has(pid)) {
        seenPids.add(pid);
        // Extract product name from slug (replace hyphens with spaces, capitalize)
        const name = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        productLinks.push({ pid, name, slug });
      }
    }

    // Also try to extract prices from the page text
    // Price pattern: $X.XX or $X.XX-XX.XX
    const priceRegex = /\$(\d+\.\d{2})(?:-(\d+\.\d{2}))?/g;
    const prices = [];
    while ((match = priceRegex.exec(html)) !== null) {
      prices.push(parseFloat(match[1]));
    }

    return productLinks;
  } catch (err) {
    console.log(`    ⚠️ Website scrape failed for "${keyword}": ${err.message}`);
    return [];
  }
}

/**
 * MAIN: Search pet products from CJ WEBSITE (live products only)
 * Then use API to get full details for each verified product
 *
 * Flow:
 * 1. Scrape CJ website search results (US warehouse + Pet category filter)
 * 2. For each product found on website, get full details via API
 * 3. Return products with images, variants, and valid pricing
 */
export async function searchPetProducts() {
  await getAccessToken();

  const allProductPids = [];
  const seenPids = new Set();

  // STEP 1: Browse CJ Pet Supplies category pages (US warehouse)
  // Same URL the user browses manually — no keyword search, just category listing
  console.log("  Step 1: Browsing CJ Pet Supplies (US warehouse)...");

  // Browse first 5 pages of Pet Supplies category
  const MAX_PAGES = 5;
  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      process.stdout.write(`    Page ${page}/${MAX_PAGES}... `);
      const products = await scrapeProductsFromWebsite(page);

      let added = 0;
      for (const p of products) {
        if (!seenPids.has(p.pid)) {
          seenPids.add(p.pid);
          allProductPids.push(p);
          added++;
        }
      }
      console.log(`${products.length} found, ${added} new`);

      if (products.length === 0) {
        console.log("    No more products. Stopping pagination.");
        break;
      }

      // Delay between page requests
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.log(`failed: ${err.message}`);
    }
  }

  console.log(`\n  Step 2: Found ${allProductPids.length} live products. Getting details via API...`);

  // STEP 2: Get full details via API for each website-verified product
  const validProducts = [];

  for (const p of allProductPids) {
    try {
      process.stdout.write(`    ${p.name.substring(0, 55)}... `);

      const details = await getProductDetails(p.pid);

      if (!details) {
        console.log("❌ no API data");
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }

      if (!details.productImage) {
        console.log("❌ no images");
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }

      const price = parseFloat(details.sellPrice || 0);
      if (price < 1 || price > 30) {
        console.log(`❌ price $${price} out of range`);
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }

      // Build a product object compatible with our importer
      validProducts.push({
        pid: p.pid,
        productNameEn: details.productNameEn || p.name,
        sellPrice: details.sellPrice || "0",
        productImage: details.productImage,
        _cachedDetails: details
      });

      console.log(`✅ $${price}`);
      await new Promise(r => setTimeout(r, 1500));

      // Stop after 25 valid products
      if (validProducts.length >= 25) {
        console.log("    Found 25 verified products — enough for selection");
        break;
      }
    } catch (err) {
      console.log(`⚠️ ${err.message}`);
      if (err.response?.status === 429) {
        console.log("    Rate limited. Waiting 15s...");
        await new Promise(r => setTimeout(r, 15000));
      } else {
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  }

  console.log(`\n  Result: ${validProducts.length} products verified and ready for AI selection`);
  return validProducts;
}
