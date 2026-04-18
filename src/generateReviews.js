/**
 * generateReviews.js
 * Fetches all Shopify products, generates 5-10 human-style reviews per product,
 * exports to Excel in Judge.me import format.
 * 90% 5-star, 10% 4-star. Distinct styles, no AI markers.
 */

import axios from "axios";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

const {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ACCESS_TOKEN,
  SHOPIFY_API_VERSION = "2026-01",
  GEMINI_API_KEY,
} = process.env;

const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json",
  },
});

// Pool of first + last names
const FIRST_NAMES = [
  "Emma","Liam","Olivia","Noah","Ava","Ethan","Sophia","Mason","Isabella","Logan",
  "Mia","Lucas","Charlotte","Aiden","Amelia","Jackson","Harper","Caden","Evelyn","Grayson",
  "Abigail","Carter","Emily","Jayden","Elizabeth","Luke","Mila","Daniel","Ella","Henry",
  "Madison","Owen","Scarlett","Ryan","Victoria","Nathan","Grace","Caleb","Chloe","Isaac",
  "Penelope","Hunter","Riley","Eli","Zoey","Christian","Nora","Connor","Lily","Jaxon",
  "Eleanor","Levi","Hannah","Aaron","Lillian","Thomas","Addison","Charles","Aubrey","Wyatt",
  "Ellie","Sebastian","Stella","Zachary","Natalie","Julian","Zoe","Gavin","Leah","Nolan",
  "Hazel","Tyler","Violet","Austin","Aurora","Adam","Savannah","Easton","Audrey","Bentley",
  "Brooklyn","Jeremiah","Bella","Kevin","Claire","Dominic","Skylar","Angel","Lucy","Jace",
  "Paisley","Everett","Everly","Jordan","Anna","Brody","Caroline","Xavier","Genesis","Josiah",
  "Aaliyah","Jason","Kennedy","Cooper","Kinsley","Elias","Allison","Brooks","Gabriella","Colton",
  "Samantha","Cameron","Alexa","Chase","Autumn","Silas","Sarah","Sawyer","Nevaeh","Declan",
];

const LAST_NAMES = [
  "Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Wilson","Moore",
  "Taylor","Anderson","Thomas","Jackson","White","Harris","Martin","Thompson","Young","Allen",
  "King","Wright","Scott","Torres","Nguyen","Hill","Flores","Green","Adams","Nelson",
  "Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts","Gomez","Phillips","Evans",
  "Turner","Diaz","Parker","Cruz","Edwards","Collins","Reyes","Stewart","Morris","Sanchez",
  "Rogers","Reed","Cook","Morgan","Bell","Murphy","Bailey","Cooper","Richardson","Cox",
  "Howard","Ward","Torres","Peterson","Gray","Ramirez","James","Watson","Brooks","Kelly",
  "Sanders","Price","Bennett","Wood","Barnes","Ross","Henderson","Coleman","Jenkins","Perry",
  "Powell","Long","Patterson","Hughes","Flores","Butler","Simmons","Foster","Gonzalez","Bryant",
];

const EMAIL_DOMAINS = [
  "gmail.com","yahoo.com","hotmail.com","outlook.com","icloud.com","aol.com","live.com",
  "me.com","protonmail.com","comcast.net","att.net","verizon.net","msn.com",
];

const PET_WORDS = ["dog","cat","pup","kitty","pets","pawz","furry","pooch","bark","meow","mutt","fido","whiskers","rex"];
const ADJECTIVES = ["happy","lucky","cool","sweet","wild","sunny","jolly","real","true","simple","daily","best"];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function ri(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateEmail(firstName, lastName) {
  const fn = firstName.toLowerCase();
  const ln = lastName.toLowerCase();
  const domain = randomFrom(EMAIL_DOMAINS);
  const year = ri(1975, 2002);
  const num2 = ri(10, 99);
  const num3 = ri(100, 999);
  const smallNum = ri(1, 9);
  const pet = randomFrom(PET_WORDS);
  const adj = randomFrom(ADJECTIVES);

  // Large pool of patterns — randomly pick one each time, no dominant pattern
  const patterns = [
    `${fn}.${ln}@${domain}`,
    `${fn}${ln}@${domain}`,
    `${fn}_${ln}@${domain}`,
    `${fn}${ln}${num2}@${domain}`,
    `${fn}.${ln}${num2}@${domain}`,
    `${fn}${year}@${domain}`,
    `${fn}.${year}@${domain}`,
    `${ln}${fn[0]}${num2}@${domain}`,
    `${fn[0]}${ln}@${domain}`,
    `${fn[0]}${ln}${num2}@${domain}`,
    `${fn[0]}${ln}${year}@${domain}`,
    `${fn}${smallNum}${ln}@${domain}`,
    `${adj}${fn}@${domain}`,
    `${fn}.${adj}@${domain}`,
    `${pet}lover.${fn}@${domain}`,
    `${fn}${pet}${num2}@${domain}`,
    `${fn}the${pet}@${domain}`,
    `${adj}${pet}${num2}@${domain}`,
    `${ln}.family@${domain}`,
    `${fn}fam${num2}@${domain}`,
    `${fn}${num3}@${domain}`,
    `${adj}${ln}@${domain}`,
    `${fn}.${ln}.${smallNum}@${domain}`,
    `${pet}mom.${fn}@${domain}`,
    `${pet}dad${num2}@${domain}`,
    `${fn}xo@${domain}`,
    `real${fn}${num2}@${domain}`,
    `the${fn}${ln}@${domain}`,
    `${fn}lives@${domain}`,
    `${fn}${ln}.home@${domain}`,
  ];
  return randomFrom(patterns);
}

function randomDate() {
  const now = new Date();
  // Spread over last 14 months, weighted recent
  const daysAgo = Math.floor(Math.pow(Math.random(), 0.5) * 420);
  const d = new Date(now.getTime() - daysAgo * 86400000);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} UTC`;
}

function pickRating() {
  return Math.random() < 0.90 ? 5 : 4;
}

async function generateReviewsForProduct(product) {
  const count = Math.floor(Math.random() * 6) + 5; // 5-10 reviews

  // Randomly decide rating distribution per product — feels more organic
  const roll = Math.random();
  let fiveStarCount, fourStarCount;
  if (roll < 0.35) {
    // All 5-star (35% of products)
    fiveStarCount = count;
    fourStarCount = 0;
  } else if (roll < 0.75) {
    // ~90% 5-star, rest 4-star
    fiveStarCount = Math.max(count - 1, Math.round(count * 0.90));
    fourStarCount = count - fiveStarCount;
  } else {
    // ~80% 5-star, rest 4-star (20% of products — still very good)
    fiveStarCount = Math.round(count * 0.80);
    fourStarCount = count - fiveStarCount;
  }

  const ratings = [
    ...Array(fiveStarCount).fill(5),
    ...Array(fourStarCount).fill(4),
  ].sort(() => Math.random() - 0.5);

  const prompt = `You are generating ${count} customer reviews for a pet product sold on FurryFable.com.

Product: "${product.title}"
Product type: "${product.product_type || "pet product"}"

Generate exactly ${count} reviews. Each review must have:
- title: short review title (sometimes just 2-4 words, sometimes a full sentence)
- body: the review text

STRICT RULES:
- Mix of very short (1 sentence) and longer (3-5 sentences) reviews
- All completely different writing styles, vocabulary, and tone
- Some casual and brief, some detailed and enthusiastic, some matter-of-fact
- No symbols like ---, ***, ##, bullet points in the review text
- No words like "disappointed" or "terrible" for 5-star reviews
- For 4-star reviews, one small mild concern is fine (shipping took a bit, packaging could be better)
- Real human tone. Not corporate. Not AI-sounding.
- Never mention CJ, dropshipping, supplier, China, or warehouse
- Reviewer is a pet owner in USA
- Each review must be completely unique from the others

Return ONLY a valid JSON array, no markdown:
[
  {"title": "...", "body": "..."},
  ...
]`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 4096 },
    }
  );

  let text = res.data.candidates[0].content.parts[0].text;
  text = text.replace(/```json|```/g, "").trim();

  let reviews;
  try {
    reviews = JSON.parse(text);
  } catch {
    // Try to extract JSON array
    const match = text.match(/\[[\s\S]*\]/);
    reviews = match ? JSON.parse(match[0]) : [];
  }

  return reviews.slice(0, count).map((r, i) => {
    const firstName = randomFrom(FIRST_NAMES);
    const lastName = randomFrom(LAST_NAMES);
    return {
      title: r.title || "Great purchase",
      body: r.body || "Really happy with this product.",
      rating: ratings[i] || 5,
      review_date: randomDate(),
      reviewer_name: `${firstName} ${lastName}`,
      reviewer_email: generateEmail(firstName, lastName),
      product_id: product.id,
      product_handle: product.handle,
      reply: "",
      picture_urls: "",
    };
  });
}

async function getAllProducts() {
  const products = [];
  let url = "/products.json?limit=250&fields=id,title,handle,product_type";
  while (url) {
    const res = await shopify.get(url);
    products.push(...res.data.products);
    const link = res.headers["link"] || "";
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next
      ? next[1].replace(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`, "")
      : null;
  }
  return products;
}

async function main() {
  console.log("=== FurryFable: Generate Reviews ===\n");

  const products = await getAllProducts();
  console.log(`Found ${products.length} products\n`);

  const allRows = [];
  let done = 0;

  for (const product of products) {
    try {
      const reviews = await generateReviewsForProduct(product);
      allRows.push(...reviews);
      done++;
      console.log(`  [${done}/${products.length}] "${product.title}" — ${reviews.length} reviews`);
      // Respect Gemini rate limits
      await new Promise(r => setTimeout(r, 1200));
    } catch (err) {
      console.log(`  ✗ "${product.title}": ${err.message}`);
    }
  }

  // Write Excel
  const headers = ["title","body","rating","review_date","reviewer_name","reviewer_email","product_id","product_handle","reply","picture_urls"];
  const wsData = [
    headers,
    ...allRows.map(r => headers.map(h => r[h] ?? "")),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto column widths
  ws["!cols"] = [
    { wch: 40 }, { wch: 80 }, { wch: 8 }, { wch: 28 },
    { wch: 20 }, { wch: 35 }, { wch: 15 }, { wch: 35 },
    { wch: 10 }, { wch: 10 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Reviews");

  const outPath = path.join(process.cwd(), "furryfable-reviews.xlsx");
  XLSX.writeFile(wb, outPath);

  console.log(`\n=== Done: ${allRows.length} reviews for ${done} products ===`);
  console.log(`Saved: ${outPath}`);
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
