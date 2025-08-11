```md
# Amazon Search Scraper — Bun + Express + JSDOM (Backend) & Vite (Frontend)

## What it does
- Backend endpoint `GET /api/scrape?keyword=YOUR_KEYWORD` fetches the **first page** of Amazon search and extracts:
  - Product title
  - Rating (out of 5)
  - Number of reviews
  - Product image URL
- Frontend calls the endpoint and renders a clean grid of results.

## Prerequisites
- [Bun](https://bun.sh) v1.1+ for the backend
- Node 18+ (or any package manager) for the frontend

## Quickstart
```bash
# 1) Backend
cd backend
cp .env.example .env   # optional: edit PORT / AMAZON_DOMAIN
bun install
bun run dev            # http://localhost:5174

# 2) Frontend (in a new terminal)
cd ../frontend
npm i                  # or bun install
npm run dev            # http://localhost:5173
