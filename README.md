
# Clinical Expert Review — Free GitHub Pages + Google Sheets

This repo gives you a no-cost workflow:

- **Frontend**: Static app hosted on **GitHub Pages** (free).
- **Storage**: A **Google Apps Script Web App** that appends each submission to a **Google Sheet** (free). You can download the sheet as CSV anytime.

## Quick Start

1) **Create a GitHub repo** (e.g., `clinical-expert-review-app`) and upload these files.  
   - Ensure the CSV is at `data/patients.csv`. You can replace it with your actual file (same path/filename).  
   - Enable GitHub Pages: Settings → Pages → Build and deployment → Source: "Deploy from a branch", Branch: `main` → `/root`.

2) **Create the backend (one-time):**
   - Go to https://script.google.com/ → New project.  
   - Replace the default code with the contents of `backend/google_apps_script.gs`.  
   - Click the disk icon to save and name the project (e.g., "ClinicalExpertReview").  
   - Click **Deploy** → **New deployment** → **Select type: Web app**.  
   - Set **Who has access** to **Anyone** (or **Anyone with the link**).  
   - Click **Deploy** → Authorize with your Google account → You will get a **Web App URL**. Copy it.

3) **Wire the app to the backend:**
   - Open your GitHub Pages site. In the top-right of the app, paste the **Web App URL** into "Backend endpoint" and click **Save**.  
   - That URL is stored in your browser's localStorage, so you only paste it once per device.

4) **Use the app:**
   - Navigate between patients using **Back**/**Next**.  
   - Fill the three items: **Outcome (0/1)**, **Confidence**, **Postop SNOT22 slider**.  
   - Click **Save & Next**. Each submission is appended to your Google Sheet.  
   - The app prevents duplicate submissions per patient **per browser**. Enable *Allow re‑submit* to override.

5) **Download results as CSV:**
   - In Google Sheets (for the linked sheet), File → Download → Comma‑separated values (.csv).

## Customize
- If your last three columns already exist in the CSV with specific names, edit `inferExpertColumns()` in `app.js` to match your header so those columns are hidden from the table display.
- To prefill or restrict inputs, edit the `#expertInputs` section in `index.html` and the payload in `app.js`.

## Privacy Notes
- The static site never writes to your CSV file directly (GitHub Pages is read-only). It **POSTs** answers to your private Google Sheet.
- Do not collect PHI without proper approvals. Restrict access to the app link if needed.

