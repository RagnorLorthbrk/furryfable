/**
 * cjApiTest.js
 * Makes a raw listV2 call and prints full request + response for CJ support.
 */
import axios from "axios";

const { CJ_EMAIL, CJ_API_KEY } = process.env;

async function getToken() {
  const res = await axios.post(
    "https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken",
    { email: CJ_EMAIL, password: CJ_API_KEY }
  );
  return res.data.data.accessToken;
}

async function main() {
  const token = await getToken();

  const BASE = "https://developers.cjdropshipping.com/api2.0/v1/product/listV2";
  const params = { page: 1, size: 10, sort: "asc", orderBy: 2, countryCode: "US" };

  const queryString = Object.entries(params).map(([k, v]) => `${k}=${v}`).join("&");
  const fullUrl = `${BASE}?${queryString}`;

  console.log("=== REQUEST ===");
  console.log("URL:", fullUrl);
  console.log("Header: CJ-Access-Token: [TOKEN HIDDEN]");
  console.log("");

  const res = await axios.get(BASE, {
    params,
    headers: { "CJ-Access-Token": token }
  });

  console.log("=== RESPONSE BODY ===");
  console.log(JSON.stringify(res.data, null, 2));

  // Also check a known-removed PID via /product/query
  console.log("\n\n=== VERIFICATION: /product/query on known removed PID ===");
  const removedPid = "1661977359978860544";
  const qRes = await axios.get(
    "https://developers.cjdropshipping.com/api2.0/v1/product/query",
    { params: { pid: removedPid, countryCode: "US" }, headers: { "CJ-Access-Token": token } }
  );
  console.log(`PID: ${removedPid}`);
  console.log(JSON.stringify(qRes.data, null, 2));
}

main().catch(err => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
