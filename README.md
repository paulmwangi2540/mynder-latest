# mylnder Admin Dashboard

Responsive React + TypeScript + Tailwind CSS admin dashboard.

## Run locally

```bash
npm install
npm run dev
```

Create a production build with `npm run build`.

## Live users API

The Saved Users page fetches real records from the admin API. For local development, configure `.env` to use the Vite proxy:

```env
VITE_ADMIN_API_ORIGIN=https://your-api-host.example
VITE_ADMIN_USERS_API_URL=/api/admin/users
```

The Vite development server proxies `/api` requests to `VITE_ADMIN_API_ORIGIN`, avoiding browser CORS restrictions while developing. If you change `.env`, restart the Vite development server. In production, set `VITE_ADMIN_USERS_API_URL` to the full API URL and `VITE_ADMIN_API_ORIGIN` to its origin; the development proxy is not included in production builds. Configure the backend to allow the deployed dashboard's origin for API and image-download requests. The endpoint must return JSON containing an array of users, either directly or under `users`, `data`, `items`, or `results`.

The API mapper supports common fields including `user_id`/`id`, `name`, `ig_username`, `major`, university/school fields, `bio`, song selections (`song`, `song_option`, or `song_choice`), and photo arrays (`photos`, `images`, `user_photos`, or `photo_urls`). Bio and song are shown in the user details view, included in search and CSV exports, and may be omitted by the API. Photo entries may be URL strings or objects containing `url`, `photo_url`, `image_url`, `src`, `path`, or `filename`. Saved photo paths under `/api/images/:filename` are fetched only when a photo is visible or downloaded; that endpoint must return JSON with an `imageUrl` field containing the signed storage URL used by the gallery and download actions. Simultaneous user-list reads are deduplicated while in flight.

## Backend requirements

- The endpoint must be reachable from the browser and allow CORS requests from your frontend origin (for example `http://localhost:5173` or your deployed dashboard domain).
- The `VITE_` variables are public configuration and are included in the browser bundle. The admin endpoint should be protected by your backend's admin authentication. Do not put API keys, server secrets, or database credentials in this frontend `.env`; keep secrets on the backend.
- Relative photo paths are resolved against the API host. Bare photo filenames are resolved through `GET /api/images/:filename`, which must return JSON with an `imageUrl` signed storage URL.
- If the API's response field names differ, update `src/admin/services/usersService.ts` in `mapUser()`.
- User records are cached in browser `localStorage` for five minutes; invoice lookups are cached for two minutes. This reduces repeat API requests, but cached admin profile and invoice data remains in that browser until the entries expire or site storage is cleared. Do not use this dashboard on a shared or untrusted browser.

## Admin authentication and accounts

The Admins page lists accounts with `GET /api/admin`, edits name/email with `PATCH /api/admin/:id`, and deletes accounts with `DELETE /api/admin/:id`. These endpoints must be available on the backend and return admin records containing `id`, `name`, and `email`; list responses may be a direct array or wrapped in `admins`, `items`, or `results`.

The dashboard signs administrators in with `POST /api/admin/login` and creates accounts with `POST /api/admin`, using the backend's documented JSON fields. Create an account at `/admin/signup` before signing in; additional accounts can also be created from Administration → Admins. Names must contain non-whitespace text and be at most 100 characters; emails are limited to 254 characters; passwords must be 12–128 characters and not all whitespace. The access token is held in Zustand and persisted in `sessionStorage` for the current browser tab; admin API requests include it as a Bearer token. Sign out clears the token and cached user/invoice data. Passwords are not stored or returned to the UI.

Admin creation and login are public for the current development phase, and existing backend routes are not JWT-protected. The frontend route guard only controls dashboard navigation; it is not a security boundary. Before exposing the dashboard, require authentication and authorization on protected backend routes, and restrict admin creation to an authorized administrator.

## Admin profile posters

The user-details modal can generate a 768 × 1024 PNG from any photo in that user's gallery. The photo is kept natural and clear; the university's configured `custom_color` is used for the thin frame and angular neon-style website/Instagram text plates. The bottom Instagram plate shows the fixed account `@mylnderofficial`, with white handle text and the standard Instagram gradient icon. The original 3:4 canvas size and frame placement are preserved; PNG export is lossless and high-quality canvas resampling is used when fitting the source image. A fresh signed image URL is requested for poster generation to avoid using expired links. The generated file is previewed in the browser and downloaded locally; it is not uploaded or saved by the dashboard. If the university color is missing or invalid, the poster warns and falls back to the dashboard's documented Myinder orange. Image downloads require the image server and storage host to allow browser CORS requests.

## User invoices

The user details modal looks up the invoice number included on each user record with `GET /api/admin/invoices/:invoiceNumber`. Invoice number casing is preserved in the request path. Responses may be direct invoice objects or wrapped in `data`/`result`, and may include `amount_minor`, `currency`, `paid_at`, or a nested `payment` object. The lookup result is cached in local storage for two minutes.

The admin Invoices tab loads every page from `GET /api/admin/invoices?page=1&limit=100`, which is the authoritative invoice list and does not depend on invoice references appearing in user records. It matches invoice `user_id` values to user names and `payment_id` values to statuses from `GET /api/admin/payments`, then displays payment/invoice status, amount, and available hosted/PDF links with search and status filtering. The API currently lists persisted paid/refunded invoices; payments whose invoices are still processing are not part of this invoice list. The separate `GET /api/payments/:id` endpoint requires a customer status token and is not used by the administrator invoice list.

The super-admin dashboard's Payment methods card compares the percentage mix of direct-user invoice payments with staff-recorded sales, calculated separately by transaction count. Direct-user methods are read from invoice/payment mode fields and are also shown in the Invoices list; direct payments without a method are grouped as Unspecified. The card includes successful and refunded direct invoices and all recorded staff sales.

## Payment plan

The admin sidebar links to a Payment Plan page. It reads the current price from `GET /api/plan` and publishes a changed amount with `POST /api/plan`, preserving the current plan name, currency, and features. The API creates a new current price version; it does not overwrite previous versions or change prices already attached to purchases. Amounts must be positive and have at most two decimal places.

The backend documentation states that `/api/plan` currently has no authentication guard. The admin UI does not add a client-side credential in place of server authorization; protect plan management on the backend before exposing it publicly.

## Staff attendance

The staff sidebar's Attendance page uses the authenticated `/api/admin/time-tracking` endpoints to clock in, pause for breaks, resume, clock out, review one day's shift history, and review active-time totals. Shift history defaults to the current date and can be filtered to another date. The API calculates work and break durations; break time is excluded from active hours. The page polls the current shift while it is open and displays timestamps in `Africa/Nairobi`.

Staff must have an open shift to access the rest of the dashboard. Without an active shift, the dashboard routes them to Attendance and does not fetch the saved-users list; the Attendance page remains available so they can clock in. An active or paused shift grants access, while clocking out removes it.

Configure the backend's `SHIFT_RESET_TIMEZONE=Africa/Nairobi` to match the dashboard's noon workday boundary. The server closes open shifts at noon, including paused shifts, and returns `reset_at`; its current-shift response is empty when there is no open shift. The UI relies on this server-side reset and does not send client timestamps or duration values. Ensure the backend protects these endpoints and scopes regular admins to their own records.

The super-admin and staff headers read the authenticated admin's notification inbox from `/api/admin/notifications`, check the unread count every 20 seconds, and support pagination, marking individual items read/unread, and marking all items read. A newly received notification animates the bell and can trigger a device notification after the admin grants browser permission. The browser/operating system uses its configured notification sound and settings; the dashboard does not synthesize or select a sound. Notification requests are uncached and rely on the backend to enforce recipient-only access and transactional event creation.

The staff Attendance workspace shows daily sales totals by Zelle, Cash App, Venmo, PayPal, Apple Pay, and Other above Shift history. Sales are recorded against the staff member's assigned universities through the authenticated `/api/sales` endpoints. The form collects payment method, amount, and sale date. The backend sets the sale time and returns it in sale responses; `time` is intentionally omitted from create requests because the API rejects it as an input field.

The super-admin Staff sales page lists sales recorded by all staff, including the staff member, university, payment method, amount, date, and time. It supports filtering by staff member and an inclusive date range using the authenticated `/api/sales` and admin directory endpoints.

The super-admin-only Expenses page manages manual expenses, monthly rent, and staff salary payments using the authenticated `/api/expenses/manual`, `/api/expenses/rent`, and `/api/expenses/salary` endpoints. It supports listing, creating, editing, and deleting those records. Expense and salary forms require an exchange rate in KES per USD; USD amount is optional and is calculated as KES divided by the exchange rate when left blank. Salary records are assigned to a staff member and month, with the backend enforcing one salary payment per staff member per period. Apply the backend expense database migrations before using the page; the server must enforce super-admin access.

The super-admin Reports page summarizes expenses (manual expenses, rent, and salaries) or sales. Reports can be filtered by report type, staff member, and date range, with quick date presets and an Excel workbook export.

## Assigned account records

The staff sidebar's **My Accounts** page uses the authenticated `GET`, `POST`, `PATCH`, and `DELETE /api/admin/accounts` endpoints to list, create, update, and remove records owned by the signed-in staff member. It displays original credentials with reveal controls; account requests use `Cache-Control: no-store` and are not cached by the page. The super-admin sidebar's **Accounts** page manages all records, filters by staff owner, and can reassign ownership with `admin_id`.

Both roles can import an atomic batch of 1–1000 account rows by pasting a JSON array. Duplicate handles are rejected unless **Skip duplicate handles** is enabled, which maps to `skip_existing: true`. Handles are unique per owner, case-insensitively. The backend must enforce account ownership and authorization, validate the documented field limits, encrypt stored passwords using `ACCOUNT_DATA_ENCRYPTION_KEY`, and return original passwords only to authorized account list/detail reads. The browser UI is not a security boundary.

## Overview analytics

The Overview groups saved users by university and charts new registrations over the selected 7-, 30-, or 90-day period using each user's `created_at` timestamp. User lists are fetched across all API pages so the counts are not limited to the first page. These are registration counts, not active visits or sessions; the current API does not provide time-based service-access analytics.

## Included

- Sidebar navigation and admin footer
- Saved users grid with search, total count and pagination
- User details modal with name, university, major, Instagram and uploaded images
- Individual image downloads and Download All Images ZIP action
- Loading and API error states
# mynder-Admin
# mynder-Admin
