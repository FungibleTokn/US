# Federal Contract Command Center

A zero-dependency Node.js dashboard that surfaces live federal contract awards from the public USAspending API.

## Run locally

```powershell
node server.js
```

Open `http://localhost:3000`.

## Included MVP features

- Live contract award search, served through `/api/contracts`
- Agency filtering and vendor/award text search
- A review queue for expired or near-expiry awards
- Live award-value and top-awarding-agency summaries from `/api/summary`
- A `/health` endpoint for hosting checks

## Data boundary

USAspending is the current source for public contract-award data. The existing opportunities navigation is a UI placeholder; connecting it to SAM.gov requires a SAM.gov API key and should be added through a server-side integration so the key is never exposed in the browser.

## Deploy

The app uses only Node's built-in modules. Deploy it to any Node-compatible host, define `PORT` if the host requires one, and route requests to `server.js`.
