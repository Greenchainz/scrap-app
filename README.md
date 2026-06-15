# Scrappalot

**AI-powered scrap metal analyzer for the scrapper community.**

Point your phone at any object — appliance, engine, pipe, car part — and instantly see every metal inside it, what it's worth at your local scrap yard, and exactly how to break it down.

---

## What It Does

1. **Snap a photo** — point the camera at any object
2. **AI identifies every metal** — copper, aluminum, steel, brass, stainless, and more
3. **Get a dollar value** — weight-range estimate with regional pricing (your state matters)
4. **See how to pull it apart** — step-by-step extraction instructions
5. **Safety first** — warnings flagged before you touch anything
6. **History** — every scan saved locally so you can reference past jobs

---

## Tech Stack

| Layer | Tech |
|---|---|
| Mobile | React Native (Expo) + TypeScript |
| Backend | Node.js + tRPC + Express |
| AI | Azure OpenAI GPT-4o (vision) |
| Storage | Azure Blob Storage (scan images) |
| Database | PostgreSQL via Drizzle ORM |
| Container | Docker |

---

## Repo Structure

```
scrap-app/
├── mobile/               # Expo React Native app
│   ├── screens/
│   │   ├── CameraScreen.tsx     # Capture + upload + trigger analysis
│   │   ├── ResultsScreen.tsx    # Metal breakdown, value, extraction steps
│   │   └── HistoryScreen.tsx    # Local scan history
│   └── utils/
│       ├── trpc.ts              # tRPC client setup
│       └── cache.ts             # Local scan cache
├── server/               # Express + tRPC API
│   └── src/
│       ├── routers/scrap.ts     # analyzeImage, getSasToken, getScans
│       ├── openai.ts            # GPT-4o vision call + structured output
│       ├── pricing.ts           # Metal prices + regional multipliers
│       ├── schema.ts            # Drizzle DB schema
│       └── db.ts                # DB connection
├── drizzle/              # DB migrations
├── Dockerfile
└── .env.example
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL database
- Azure OpenAI resource (GPT-4o deployment)
- Azure Storage account
- Expo CLI (`npm install -g expo-cli`)

### 1. Clone & install

```bash
git clone https://github.com/Greenchainz/scrap-app.git
cd scrap-app

# Install server deps
cd server && npm install

# Install mobile deps
cd ../mobile && npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your values (see .env.example)
```

Required vars:
```
DATABASE_URL
AZURE_OPENAI_ENDPOINT
AZURE_OPENAI_API_KEY
BLOB_STORAGE_CONNECTION_STRING
BLOB_CONTAINER_NAME
```

### 3. Run DB migrations

```bash
cd server
npx drizzle-kit push
```

### 4. Start the server

```bash
cd server
npm run dev
# Runs on http://localhost:3000
```

### 5. Start the mobile app

```bash
cd mobile
npx expo start
```

Scan the QR code with Expo Go on your phone.

---

## How the AI Works

The app sends the captured image to **Azure OpenAI GPT-4o** with a system prompt tuned for scrap metal identification. The model returns a structured JSON response (enforced via `json_schema`) with:

- `objectName` — what the object is
- `metals[]` — array of metals identified, each with type, weight range, and % composition
- `extractionSteps[]` — ordered steps to disassemble and separate the metals
- `difficulty` — `easy` / `moderate` / `hard`
- `safetyWarnings[]` — hazards to be aware of (capacitors, asbestos, sharp edges, etc.)

Dollar values are calculated server-side using `pricing.ts` with per-state regional multipliers, so a scrapper in California sees different numbers than one in Ohio.

---

## Docker

```bash
docker build -t scrappalot-server .
docker run -p 3000:3000 --env-file .env scrappalot-server
```

---

## Roadmap

- [ ] Live commodity price feed (replace hardcoded metal prices)
- [ ] Full 50-state regional pricing
- [ ] Scrap yard locator (nearest yards by GPS)
- [ ] YouTube tutorial links per metal type / object category
- [ ] User accounts + cloud-synced scan history
- [ ] Offline mode (cached model for common objects)

---

## License

Proprietary — © 2026 GreenChainz. All rights reserved.
