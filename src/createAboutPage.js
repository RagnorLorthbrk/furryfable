import axios from "axios";

const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN, SHOPIFY_API_VERSION = "2026-01" } = process.env;

const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

const aboutPageHtml = `
<div class="about-page">

<h1>About FurryFable</h1>

<p>At FurryFable, we believe every pet deserves products that are thoughtfully chosen, built to last, and designed with their comfort in mind. We're a pet-first brand serving dog and cat parents across the United States and Canada.</p>

<h2>Our Mission</h2>

<p>We started FurryFable with a simple goal: make it easy for pet parents to find high-quality, functional products without overpaying or second-guessing. Every item in our store is hand-selected for durability, safety, and real-world usefulness — because your pet's comfort isn't something we take lightly.</p>

<h2>What We Offer</h2>

<ul>
  <li><strong>Pet Apparel</strong> — Cozy sweaters, winter jackets, and seasonal outfits designed for comfort and easy wear</li>
  <li><strong>Harnesses &amp; Leashes</strong> — No-pull mesh harnesses, reflective leashes, and velvet collar sets for safe, stylish walks</li>
  <li><strong>Interactive Toys</strong> — Puzzle feeders, automatic ball launchers, LED cat toys, and enrichment products that keep pets mentally stimulated</li>
  <li><strong>Feeders &amp; Water Bottles</strong> — Portable travel dispensers, gravity feeders, and smart automatic feeders for busy pet parents</li>
  <li><strong>Comfort &amp; Wellness</strong> — Calming anxiety vests, orthopedic solutions, and products designed for senior pets</li>
  <li><strong>Safety &amp; Tech</strong> — AirTag-compatible collars, health monitoring tools, and outdoor safety gear</li>
</ul>

<h2>Why Pet Parents Trust Us</h2>

<ul>
  <li><strong>Free USA Shipping</strong> — Every order ships free within the United States</li>
  <li><strong>Quality You Can See</strong> — We personally vet every product before it goes on our shelves</li>
  <li><strong>Real Reviews</strong> — Hundreds of verified customer reviews from real pet parents</li>
  <li><strong>Hassle-Free Returns</strong> — Easy exchange and return process if something doesn't work out</li>
  <li><strong>Secure Checkout</strong> — Your payment information is always protected</li>
</ul>

<h2>Our Promise</h2>

<p>We're not the biggest pet store — and that's by design. We'd rather carry 70 products we're proud of than 7,000 we can't vouch for. Every item on FurryFable has been evaluated for quality, safety, and value.</p>

<p>Whether you're a first-time puppy parent shopping for essentials or a seasoned cat owner looking for that perfect interactive toy, we're here to help you find exactly what your pet needs.</p>

<h2>Get In Touch</h2>

<p>Have a question about a product? Need help choosing the right size? We're always happy to help.</p>

<p><a href="/pages/contact">Contact us here</a> — we typically respond within 24 hours.</p>

<p>Follow us for daily pet tips, product guides, and adorable pet content:</p>
<ul>
  <li><a href="https://www.instagram.com/furryfable.store/" target="_blank" rel="noopener">Instagram</a></li>
  <li><a href="https://www.facebook.com/furryfable" target="_blank" rel="noopener">Facebook</a></li>
</ul>

</div>
`;

async function createAboutPage() {
  // Check if About Us page already exists
  try {
    const existing = await shopify.get("/pages.json");
    const aboutPage = existing.data.pages.find(
      p => p.handle === "about" || p.handle === "about-us" || p.title.toLowerCase().includes("about")
    );

    if (aboutPage) {
      console.log(`About page already exists (ID: ${aboutPage.id}). Updating...`);
      await shopify.put(`/pages/${aboutPage.id}.json`, {
        page: {
          id: aboutPage.id,
          body_html: aboutPageHtml,
          title: "About Us"
        }
      });
      console.log("About page updated successfully.");
      return;
    }
  } catch (err) {
    console.log("Could not check existing pages:", err.message);
  }

  // Create new page
  const res = await shopify.post("/pages.json", {
    page: {
      title: "About Us",
      handle: "about",
      body_html: aboutPageHtml,
      published: true
    }
  });

  console.log(`About Us page created: ID ${res.data.page.id}`);
  console.log(`Live at: https://www.furryfable.com/pages/about`);

  // Set meta description
  try {
    await shopify.post(`/pages/${res.data.page.id}/metafields.json`, {
      metafield: {
        namespace: "global",
        key: "description_tag",
        value: "FurryFable is a premium pet products store for dog and cat parents in the USA and Canada. Free shipping, quality-vetted products, and hassle-free returns.",
        type: "single_line_text_field"
      }
    });
    console.log("Meta description set.");
  } catch (err) {
    console.error("Could not set meta description:", err.message);
  }
}

createAboutPage().catch(err => {
  console.error("Failed to create About page:", err.message);
  process.exit(1);
});
