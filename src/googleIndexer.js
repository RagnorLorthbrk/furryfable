import { google } from "googleapis";

const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

/**
 * Submit a URL to Google Search Console for indexing
 * Uses the Web Search Indexing API to request fast crawling
 */
export async function requestIndexing(url) {
  try {
    const credentials = JSON.parse(SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ["https://www.googleapis.com/auth/indexing"]
    );

    const indexing = google.indexing({ version: "v3", auth });

    const res = await indexing.urlNotifications.publish({
      requestBody: {
        url: url,
        type: "URL_UPDATED"
      }
    });

    console.log(`Google Indexing API: Submitted ${url}`);
    console.log(`  Response: ${JSON.stringify(res.data)}`);
    return true;
  } catch (err) {
    // Indexing API may not be enabled — fall back to sitemap ping
    console.warn(`Indexing API failed (${err.message}). Falling back to sitemap ping...`);
    return await pingSitemap();
  }
}

/**
 * Ping Google and Bing to re-crawl the sitemap
 * This is a free, no-auth method that works for any site
 */
export async function pingSitemap() {
  const sitemapUrl = "https://www.furryfable.com/sitemap.xml";

  const pings = [
    `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
    `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`
  ];

  for (const pingUrl of pings) {
    try {
      const res = await fetch(pingUrl);
      const engine = pingUrl.includes("google") ? "Google" : "Bing";
      console.log(`Sitemap ping to ${engine}: ${res.status === 200 ? "OK" : res.status}`);
    } catch (err) {
      console.warn(`Sitemap ping failed: ${err.message}`);
    }
  }

  return true;
}
