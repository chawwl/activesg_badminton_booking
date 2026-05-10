# activesg_badminton_booking

This repo contains a small Playwright bot for booking badminton courts on `https://activesg.gov.sg/`.

It is designed to be safe by default:

- It uses a dedicated Chrome profile directory so it does not touch your normal Chrome profile.
- It pauses for manual Singpass login when needed.
- It stops before the final paid or confirming click unless you explicitly opt in.

## What it automates

The bot will:

1. Open the ActiveSG badminton venue list.
2. Search for your target venue.
3. Open that venue's booking page.
4. Select your target date.
5. Wait for you to complete Singpass login if you are not already signed in.
6. Re-open the venue page after login.
7. Select one or more requested timeslots.
8. Advance toward the review or cart page.

## Setup

1. Install Node dependencies:

```powershell
npm install
```

2. Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

3. Edit `.env` with the venue, date, and times you want.

Example:

```env
ACTIVESG_VENUE=Bishan Sport Hall
ACTIVESG_DATE=2026-05-18
ACTIVESG_TIMES=19:00,20:00
ACTIVESG_SEARCH_TERM=Bishan
ACTIVESG_AUTO_FINAL_CONFIRM=false
```

## Run

```powershell
npm run book
```

## Notes

- `ACTIVESG_DATE` must be in `YYYY-MM-DD` format.
- `ACTIVESG_TIMES` must be comma-separated 24-hour times such as `19:00,20:00`.
- If Chrome is not discoverable by Playwright on your machine, set `CHROME_EXECUTABLE_PATH`.
- If ActiveSG changes button text or page structure, the selectors in [scripts/book-badminton.js](/C:/Users/chaww/Documents/New%20project/scripts/book-badminton.js) may need a quick update.
- If you want fully automatic final confirmation, set `ACTIVESG_AUTO_FINAL_CONFIRM=true`, but use that carefully because it may submit a real booking.
