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
 * Read past performance reports to identify trends
 */
async function getPerformanceHistory() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Performance!A2:K100"
    });
    return res.data.values || [];
  } catch {
    return [];
  }
}

/**
 * Read Google Search Console data from latest Performance report
 */
async function getSearchConsoleData() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Performance!L2:P100"
    });
    const rows = res.data.values || [];
    const latest = rows.filter(r => r[0] && parseInt(r[0]) > 0).pop();
    if (!latest) return null;
    return {
      clicks: latest[0] || 0,
      impressions: latest[1] || 0,
      ctr: latest[2] || "0%",
      avgPosition: latest[3] || "N/A",
      topQueries: latest[4] ? JSON.parse(latest[4]) : []
    };
  } catch {
    return null;
  }
}

/**
 * Read published blog data to find what content performs best
 */
async function getBlogHistory() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "blogs!A2:F1000"
    });
    return (res.data.values || []).filter(r => r[4] === "PUBLISHED");
  } catch {
    return [];
  }
}

/**
 * Generate optimized topic queue for next week based on performance data
 */
async function generateOptimizedTopics(perfHistory, blogHistory, gscData) {
  const recentPerf = perfHistory.slice(-4); // Last 4 weeks
  const recentBlogs = blogHistory.slice(-14); // Last 2 weeks of blogs

  const prompt = `
You are an AI-powered growth optimization engine for FurryFable.com (premium pet products).

PERFORMANCE HISTORY (last 4 reports):
${recentPerf.map(r => `Date: ${r[0]} | Orders: ${r[1]} | Revenue: $${r[2]} | Blogs: ${r[4]}/week | Summary: ${r[5]}`).join("\n")}

GOOGLE SEARCH CONSOLE DATA (what people are actually searching):
${gscData ? `Clicks: ${gscData.clicks} | Impressions: ${gscData.impressions} | CTR: ${gscData.ctr} | Avg Position: ${gscData.avgPosition}
Top queries people find us for: ${gscData.topQueries?.map(q => `"${q.query}" (${q.clicks} clicks, pos ${q.position})`).join(", ") || "No data yet"}

CRITICAL: Use these search queries to inform topic selection. If we rank for certain queries, create supporting content around those topics to build topical authority. If queries have high impressions but low clicks, create better-targeted content for those terms.` : "No Search Console data available yet."}

RECENT BLOG TOPICS:
${recentBlogs.map(r => `- ${r[1]} (keyword: ${r[2]})`).join("\n")}

PRODUCT CATALOG (topics MUST lead to these products):
- Pet Toys: interactive cat balls, puzzle toys, chew toys for aggressive chewers, scratching posts, automatic ball launchers, LED mouse toys
- Water Bottles & Feeders: portable travel dispensers, gravity feeders, kennel bottles, smart auto feeders
- Pet Apparel: dog hoodies, winter jackets, summer outfits, sweaters, costumes
- Harness & Leash: no-pull mesh harness, retractable leashes, reflective leashes, velvet collar sets, car seat belts
- Outdoor: dog car seat covers, dog backpacks, pooper scooper kits
- Safety: AirTag pet collars, ultrasonic repellents, health monitoring pee pads
- Training: dog muzzles, agility equipment, anxiety calming vests
- Cat: cat towers, scratching boards, teaser toys, electric fish toys, litter mats

ACTIVE CHANNELS:
- Blog: 1/day to Shopify (SEO + GEO)
- Social: 3 posts/day to Facebook, Instagram, Pinterest
- Quora: 2 answers/day (GEO optimization)

GOAL: Scale from current performance to 100 organic sales/month in 3 months.

TASK: Generate an optimized content plan for next week.

OPTIMIZATION RULES:
1. If orders are flat → recommend more commercial-intent topics (buying guides, "best X for Y")
2. If traffic is growing but sales aren't → recommend conversion-focused content (product comparisons, use cases)
3. If social engagement is low → recommend more relatable, shareable topics
4. At least 4 of 7 topics MUST have commercial search intent (user looking to buy)
5. Every topic must naturally lead to at least one product collection
6. Include at least 1 breed-specific guide (e.g., "Best Harness for French Bulldogs")
7. Include at least 1 seasonal topic matching current time of year

Generate exactly 7 blog topics (one per day) in JSON:
{
  "weeklyStrategy": "2-3 sentence strategy for this week based on trends",
  "topics": [
    {
      "day": "Monday",
      "title": "SEO-optimized blog title",
      "primaryKeyword": "long-tail keyword (3-5 words)",
      "imageTheme": "image description",
      "rationale": "why this topic this day",
      "type": "seo|geo|social|conversion"
    }
  ],
  "socialFocus": "What social media should emphasize this week (specific product categories to highlight)",
  "geoFocus": "Which AI engines to optimize for and specific Quora question topics to target",
  "productPush": "Which 2-3 product collections to push hardest this week and why"
}
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5 }
    }
  );

  const text = res.data.candidates[0].content.parts[0].text;
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

/**
 * Write optimized topics to the blog queue in Google Sheets
 */
async function queueTopics(plan) {
  if (!plan?.topics?.length) return;

  const rows = plan.topics.map(topic => [
    "", // Date (filled when published)
    topic.title,
    topic.primaryKeyword,
    "", // Slug (generated at publish time)
    "", // Status (empty = pending)
    topic.imageTheme
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "blogs!A:F",
    valueInputOption: "RAW",
    requestBody: { values: rows }
  });

  console.log(`📋 Queued ${rows.length} optimized topics for next week`);
}

/**
 * Save weekly plan to a Strategy sheet for tracking
 */
async function saveStrategy(plan) {
  const date = new Date().toISOString().split("T")[0];
  const row = [
    date,
    plan.weeklyStrategy || "",
    plan.socialFocus || "",
    plan.geoFocus || "",
    plan.topics?.map(t => t.title).join(" | ") || "",
    plan.productPush || ""
  ];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Strategy!A:F",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] }
    });
  } catch (err) {
    if (err.message.includes("Unable to parse range")) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: "Strategy" } } }]
        }
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: "Strategy!A1:F1",
        valueInputOption: "RAW",
        requestBody: {
          values: [["Date", "Weekly Strategy", "Social Focus", "GEO Focus", "Topics", "Product Push"]]
        }
      });

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "Strategy!A:F",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [row] }
      });
    }
  }
}

// Main execution
console.log("🧠 Starting weekly optimization engine...");

const [perfHistory, blogHistory, gscData] = await Promise.all([
  getPerformanceHistory(),
  getBlogHistory(),
  getSearchConsoleData()
]);

console.log(`Performance reports: ${perfHistory.length}`);
console.log(`Published blogs: ${blogHistory.length}`);
if (gscData) {
  console.log(`GSC: ${gscData.clicks} clicks, ${gscData.impressions} impressions`);
}

const plan = await generateOptimizedTopics(perfHistory, blogHistory, gscData);

if (plan) {
  console.log("\n═══════════════════════════════════════");
  console.log("🎯 WEEKLY OPTIMIZATION PLAN");
  console.log("═══════════════════════════════════════");
  console.log("Strategy:", plan.weeklyStrategy);
  console.log("Social Focus:", plan.socialFocus);
  console.log("GEO Focus:", plan.geoFocus);
  console.log("\nTopics for next week:");
  plan.topics?.forEach(t => {
    console.log(`  ${t.day}: ${t.title} [${t.type}]`);
    console.log(`    → ${t.rationale}`);
  });

  await queueTopics(plan);
  await saveStrategy(plan);
}

console.log("\n✅ Weekly optimization complete.");
