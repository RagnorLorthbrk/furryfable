import { google } from "googleapis";
import { generateTopic } from "./topicGenerator.js";
import { generateBlog } from "./blogGenerator.js";
import fs from "fs";

console.log("Gemini key present:", !!process.env.GEMINI_API_KEY);

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

const SHEET_RANGE = "blogs!A2:F";

async function getNextRow() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: SHEET_RANGE
  });

  const rows = res.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    if (!rows[i][4]) {
      return { row: rows[i], rowIndex: i + 2 };
    }
  }

  return null;
}

async function appendNewRow(topic) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "blogs!A:F",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        topic.date,
        topic.title,
        topic.primaryKeyword,
        topic.slug,
        "IN_PROGRESS",
        topic.imageTheme
      ]]
    }
  });

  return topic;
}

async function main() {
  let blogMeta;
  const next = await getNextRow();

  if (!next) {
    console.log("No empty rows found. Generating new topic...");
    blogMeta = await generateTopic();
    await appendNewRow(blogMeta);
  } else {
    blogMeta = {
      date: next.row[0],
      title: next.row[1],
      primaryKeyword: next.row[2],
      slug: next.row[3],
      imageTheme: next.row[5]
    };
  }

  console.log("Generating blog content for:", blogMeta.title);

  const html = await generateBlog({
    title: blogMeta.title,
    primaryKeyword: blogMeta.primaryKeyword
  });

  // Save locally (GitHub backup in next step)
  fs.writeFileSync(
    `blog-${blogMeta.slug}.html`,
    html,
    "utf8"
  );

  console.log("Blog content generated and saved");
}

main().catch(err => {
  console.error("FATAL ERROR:", err.message);
  process.exit(1);
});
