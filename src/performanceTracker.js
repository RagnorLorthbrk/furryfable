import axios from "axios";
import { google } from "googleapis";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

/**
 * Fetch Shopify store analytics (orders, traffic) via Admin API
 */
async function fetchShopifyMetrics() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || "2026-01";

  if (!domain || !token) {
    console.log("⏭️ Shopify metrics: Missing credentials. Skipping.");
    return null;
  }

  try {
    // Get recent orders (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const ordersRes = await axios.get(
      `https://${domain}/admin/api/${apiVersion}/orders.json?created_at_min=${sevenDaysAgo}&status=any`,
      { headers: { "X-Shopify-Access-Token": token } }
    );

    const orders = ordersRes.data.orders || [];
    const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
    const totalOrders = orders.length;

    // Get total products
    const productsRes = await axios.get(
      `https://${domain}/admin/api/${apiVersion}/products/count.json`,
      { headers: { "X-Shopify-Access-Token": token } }
    );

    // Get blog articles count
    const articlesRes = await axios.get(
      `https://${domain}/admin/api/${apiVersion}/articles.json?limit=1`,
      { headers: { "X-Shopify-Access-Token": token } }
    );

    return {
      weeklyOrders: totalOrders,
      weeklyRevenue: totalRevenue.toFixed(2),
      totalProducts: productsRes.data.count || 0,
      recentOrderSources: orders.map(o => ({
        source: o.source_name || "unknown",
        referrer: o.referring_site || "direct",
        total: o.total_price
      }))
    };
  } catch (err) {
    console.error("❌ Shopify metrics error:", err.message);
    return null;
  }
}

/**
 * Fetch blog performance from Google Sheets (published blogs)
 */
async function fetchBlogMetrics() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "blogs!A2:F1000"
    });

    const rows = res.data.values || [];
    const published = rows.filter(r => r[4] === "PUBLISHED");

    return {
      totalBlogs: published.length,
      last7DaysBlogs: published.filter(r => {
        const date = new Date(r[0]);
        return date > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      }).length
    };
  } catch (err) {
    console.error("❌ Blog metrics error:", err.message);
    return { totalBlogs: 0, last7DaysBlogs: 0 };
  }
}

/**
 * Generate AI-powered weekly performance analysis and recommendations
 */
async function generateWeeklyAnalysis(shopifyData, blogData, socialData) {
  const prompt = `
You are a senior e-commerce growth strategist analyzing FurryFable.com's weekly performance.

PERFORMANCE DATA:
═══════════════════
Shopify Store:
- Orders this week: ${shopifyData?.weeklyOrders || "N/A"}
- Revenue this week: $${shopifyData?.weeklyRevenue || "N/A"}
- Total products: ${shopifyData?.totalProducts || "N/A"}
- Traffic sources: ${JSON.stringify(shopifyData?.recentOrderSources || [])}

Blog:
- Total published blogs: ${blogData?.totalBlogs || 0}
- Blogs published this week: ${blogData?.last7DaysBlogs || 0}

Social Media:
- Posts this week: ${socialData?.postsThisWeek || "N/A"}
- Channels active: Facebook, Instagram${process.env.PINTEREST_ACCESS_TOKEN ? ", Pinterest" : ""}${process.env.LINKEDIN_ACCESS_TOKEN ? ", LinkedIn" : ""}

GOAL: 5 sales per week now, scaling to 100 sales/month in 3 months.
CONSTRAINT: Zero ad budget. Organic only.

Generate a JSON report:
{
  "weekSummary": "2-3 sentence summary of this week's performance",
  "strengths": ["what's working well (2-3 items)"],
  "weaknesses": ["what needs improvement (2-3 items)"],
  "actionItems": [
    {
      "priority": "high|medium|low",
      "action": "specific actionable recommendation",
      "expectedImpact": "what this will improve",
      "channel": "SEO|social|GEO|conversion|content"
    }
  ],
  "topicRecommendations": [
    "5 blog topics that would drive the most traffic based on current gaps"
  ],
  "contentCalendarAdjustments": "any changes to posting frequency or timing",
  "conversionTips": "specific tips to improve store conversion rate"
}
`;

  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 }
      }
    );

    const text = res.data.candidates[0].content.parts[0].text;
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (err) {
    console.error("❌ Analysis generation error:", err.message);
    return null;
  }
}

/**
 * Write performance report to Google Sheets
 */
async function writeReport(shopifyData, blogData, analysis) {
  const date = new Date().toISOString().split("T")[0];

  // Ensure "Performance" sheet exists or create row in existing sheet
  const reportRow = [
    date,
    shopifyData?.weeklyOrders || 0,
    shopifyData?.weeklyRevenue || 0,
    blogData?.totalBlogs || 0,
    blogData?.last7DaysBlogs || 0,
    analysis?.weekSummary || "",
    JSON.stringify(analysis?.strengths || []),
    JSON.stringify(analysis?.weaknesses || []),
    JSON.stringify(analysis?.actionItems || []),
    JSON.stringify(analysis?.topicRecommendations || []),
    analysis?.conversionTips || ""
  ];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Performance!A:K",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [reportRow] }
    });
    console.log("📊 Performance report written to Google Sheets");
  } catch (err) {
    // If Performance sheet doesn't exist, create it
    if (err.message.includes("Unable to parse range")) {
      console.log("📋 Creating Performance sheet...");
      try {
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [{
              addSheet: {
                properties: { title: "Performance" }
              }
            }]
          }
        });

        // Add headers
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: "Performance!A1:K1",
          valueInputOption: "RAW",
          requestBody: {
            values: [["Date", "Weekly Orders", "Weekly Revenue", "Total Blogs", "Blogs This Week", "Summary", "Strengths", "Weaknesses", "Action Items", "Topic Recommendations", "Conversion Tips"]]
          }
        });

        // Add data
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: "Performance!A:K",
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [reportRow] }
        });
        console.log("📊 Performance sheet created and report written");
      } catch (createErr) {
        console.error("❌ Failed to create Performance sheet:", createErr.message);
      }
    } else {
      console.error("❌ Report write error:", err.message);
    }
  }
}

// Main execution
console.log("📈 Starting weekly performance tracking...");

const [shopifyData, blogData] = await Promise.all([
  fetchShopifyMetrics(),
  fetchBlogMetrics()
]);

console.log("📊 Shopify:", shopifyData ? `${shopifyData.weeklyOrders} orders, $${shopifyData.weeklyRevenue} revenue` : "No data");
console.log("📝 Blog:", `${blogData.totalBlogs} total, ${blogData.last7DaysBlogs} this week`);

const analysis = await generateWeeklyAnalysis(shopifyData, blogData, {});

if (analysis) {
  console.log("\n═══════════════════════════════════════");
  console.log("📋 WEEKLY ANALYSIS");
  console.log("═══════════════════════════════════════");
  console.log("Summary:", analysis.weekSummary);
  console.log("Strengths:", analysis.strengths?.join(", "));
  console.log("Weaknesses:", analysis.weaknesses?.join(", "));
  console.log("\nAction Items:");
  analysis.actionItems?.forEach((item, i) => {
    console.log(`  ${i + 1}. [${item.priority}] ${item.action} → ${item.expectedImpact}`);
  });
  console.log("\nRecommended Topics:");
  analysis.topicRecommendations?.forEach((topic, i) => {
    console.log(`  ${i + 1}. ${topic}`);
  });
}

await writeReport(shopifyData, blogData, analysis);

console.log("\n✅ Performance tracking complete.");
