import { google } from "googleapis";

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});
const sheets = google.sheets({ version: "v4", auth });

async function main() {
  console.log("=== Clearing ProductImports sheet ===\n");

  // First check if the sheet exists
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheetNames = meta.data.sheets.map(s => s.properties.title);
    console.log("Existing tabs:", sheetNames.join(", "));

    if (!sheetNames.includes("ProductImports")) {
      console.log("No ProductImports tab found — nothing to clear.");
      return;
    }

    // Read current data count
    const data = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "ProductImports!A:A"
    });
    const rows = data.data.values || [];
    console.log(`Current rows in ProductImports: ${rows.length}`);

    if (rows.length <= 1) {
      console.log("Only header row (or empty) — nothing to clear.");
      return;
    }

    // Clear all data except header row
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: "ProductImports!A2:Z1000"
    });

    console.log(`✅ Cleared ${rows.length - 1} data rows (kept header)`);

  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
