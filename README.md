# Budget Flow Dashboard

A personal finance dashboard with accounts, manual transactions, savings goals, recurring planning, shortfall forecasting, and Railway-ready persistent storage.

## What changed

- The app now runs as a Node web service with `server.js`
- Budget data is saved through `/api/data`
- Accounts, transactions, and savings goals are stored with the rest of the budget state
- Local development still works on your machine
- Railway can persist data if you attach a volume and set `DATA_DIR`

## Project files

- `server.js`: serves the app and saves data to disk
- `app.js`: dashboard UI and budgeting logic
- `index.html`: page structure
- `styles.css`: dashboard styling
- `package.json`: start command for Railway and local runs

## Local run

1. Open a terminal in this folder.
2. Run `node server.js`
3. Open `http://localhost:3000`

By default, the server stores data in `./data/budget-data.json`.

## Railway setup

1. Push this folder to a GitHub repository.
2. In Railway, create a new project and choose the GitHub deploy option.
3. Select this repository.
4. Add a volume to the service.
5. Set the volume mount path to `/data`.
6. Add an environment variable named `DATA_DIR` with the value `/data`.
7. Optional but strongly recommended: add `BASIC_AUTH_USER` and `BASIC_AUTH_PASS` so the dashboard is private.
8. Deploy.

After deployment, your budget data will be written to `/data/budget-data.json` on the mounted volume.

## Notes

- If you deploy without a volume, your app may redeploy cleanly but the saved budget data can be lost later.
- `Export data` still gives you a JSON backup file any time.
- `Import JSON` restores a previous backup into the live app.
- If you set `BASIC_AUTH_USER` and `BASIC_AUTH_PASS`, the whole site is protected with browser login.
