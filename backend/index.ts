import express from "express";
import axios from "axios";
import { JSDOM } from "jsdom";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5174);
const AMAZON_DOMAIN = process.env.AMAZON_DOMAIN || "https://www.amazon.com";

app.use(cors()); // connect with frontend
app.use(express.json());

/** ---------- Helpers and parsing ---------- */
function buildAmazonSearchUrl(keyword: string) {
  const url = new URL("/s", AMAZON_DOMAIN);
  url.searchParams.set("k", keyword);
  url.searchParams.set("language", "pt_BR");
  return url.toString();
}

function parseRating(label: string | null): number | null {
  if (!label) return null;
  // Normalize , and .
  const norm = label.replace(',', '.').toLowerCase();
  const mEn = norm.match(/([0-9]+(?:\.[0-9]+)?)\s+out of\s+5/);
  const mPt = norm.match(/([0-9]+(?:\.[0-9]+)?)\s+de\s+5/);
  const m = mEn || mPt;
  return m ? parseFloat(m[1]) : null;
}

function parseReviewCount(text: string | null): number | null {
  if (!text) return null;
  // Remove non digits
  const numeric = text.replace(/[^0-9]/g, "");
  return numeric ? Number(numeric) : null;
}


function firstFromSrcSet(srcset?: string | null): string | null {
  if (!srcset) return null;
  const first = srcset.split(",")[0]?.trim().split(" ")[0]?.trim();
  return first || null;
}
function text(el: Element | null): string | null {
  return el?.textContent?.trim() || null;
}

/** ---------- Headers ---------- */
const UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
];

function headersLikeBrowser() {
  const ua = UAS[Math.floor(Math.random() * UAS.length)];
  return {
    "User-Agent": ua,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Cookie": "lc-main=pt_BR",
  };
}

async function fetchAmazonHtml(url: string): Promise<string> {
  let lastErr: any;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await axios.get<string>(url, {
        headers: headersLikeBrowser(),
        timeout: 15000,
        responseType: "text",
        maxRedirects: 5,
        validateStatus: () => true,
      });

      const { status, data } = resp;

      if (status >= 500) {
        if (attempt === 1) {
          await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
          continue;
        }
        const e: any = new Error(`Amazon returned ${status}`);
        e.status = status;
        e.body = data;
        throw e;
      }
      if (status >= 400) {
        const e: any = new Error(`Amazon returned ${status}`);
        e.status = status;
        e.body = data;
        throw e;
      }
      return data;
    } catch (err: any) {
      lastErr = err;
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, 1200));
    }
  }
  throw lastErr;
}

/** ---------- Scraper ---------- */
async function scrapeAmazon(keyword: string) {
  const url = buildAmazonSearchUrl(keyword);
  const html = await fetchAmazonHtml(url);

  // anti-bot
  const lower = html.toLowerCase();
  if (
    lower.includes("robot check") ||
    lower.includes("enter the characters you see") ||
    lower.includes("/errors/validatecaptcha")
  ) {
    const err: any = new Error("Amazon bot check / CAPTCHA page.");
    err.status = 429;
    throw err;
  }

  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const resultNodes = Array.from(
    doc.querySelectorAll<HTMLElement>(
      "div.s-main-slot div.s-result-item[data-asin][data-component-type='s-search-result'], " +
      "div.s-result-item[data-asin][data-component-type='s-search-result'], " +
      "div.s-result-item[data-asin][data-cel-widget^='search_result_']"
    )
  );

  const items = resultNodes
    .map((el) => {
      const asin = el.getAttribute("data-asin") || undefined;

      // title
      const title =
        text(el.querySelector("h2 a span")) ||
        text(el.querySelector("h2 span.a-text-normal")) ||
        text(el.querySelector("h2")) ||
        null;

      // rating
      const ratingLabel =
        text(el.querySelector("i.a-icon-star-small span.a-icon-alt")) ||
        text(el.querySelector("i.a-icon-star span.a-icon-alt")) ||
        el.querySelector("span[aria-label*='out of 5 stars']")?.getAttribute("aria-label") ||
        null;
      const rating = parseRating(ratingLabel);

      // reviews
      const reviewsText =
        el.querySelector("span[aria-label$='ratings']")?.getAttribute("aria-label") ||
        el.querySelector("span[aria-label$='rating']")?.getAttribute("aria-label") || 
        el.querySelector("span[aria-label*='avaliaç']")?.getAttribute("aria-label") || 
        text(el.querySelector("span.a-size-base.s-underline-text")) ||
        text(el.querySelector("a.a-link-normal span.a-size-base")) ||
        text(el.querySelector("span.a-size-base")) ||
        null;
      const reviewsCount = parseReviewCount(reviewsText);

      // imagem (src, data-src, srcset)
      const imgEl =
        el.querySelector<HTMLImageElement>("img.s-image") ||
        el.querySelector<HTMLImageElement>("img[data-image-latency='s-product-image']") ||
        el.querySelector<HTMLImageElement>("img");

      const imageUrl =
        imgEl?.getAttribute("src") ||
        imgEl?.getAttribute("data-src") ||
        firstFromSrcSet(imgEl?.getAttribute("srcset")) ||
        null;

      return { asin, title, rating, reviewsCount, imageUrl };
    })
    .filter((x) => x.title && x.imageUrl);

  return { url, keyword, count: items.length, results: items };
}

/** ---------- Routes ---------- */

// Debug with raw HTML
app.get("/api/debug", async (req, res) => {
  try {
    const keyword = String(req.query.keyword || "").trim();
    if (!keyword) return res.status(400).json({ error: "Missing keyword" });

    const url = buildAmazonSearchUrl(keyword);
    const html = await fetchAmazonHtml(url);
    const snippet = html.slice(0, 2000);
    const hasMainSlot = html.includes("s-main-slot");
    res.json({ url, snippet, hasMainSlot, length: html.length });
  } catch (e: any) {
    const status = e?.status || e?.response?.status || 500;
    res.status(status).json({ error: e?.message || "debug failed" });
  }
});

// Scrape
app.get("/api/scrape", async (req, res) => {
  try {
    const keyword = String(req.query.keyword || "").trim();
    if (!keyword) {
      return res.status(400).json({ error: "Missing required query param: keyword" });
    }

    const data = await scrapeAmazon(keyword);
    return res.json(data);
  } catch (err: any) {
    const status = err?.status || err?.response?.status || 500;
    const message = err?.message || "Unknown error";

    return res.status(status).json({
      error: message,
      hint:
        status === 429
          ? "Amazon bot protection triggered. Try again later, change keyword, or reduce frequency."
          : status >= 500
            ? "Amazon is returning 5xx right now. Wait a bit and retry."
            : "Check selectors/headers or try a different keyword.",
    });
  }
});

// Healthcheck
app.get("/api/health", (_, res) => {
  res.json({ ok: true, domain: AMAZON_DOMAIN });
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
