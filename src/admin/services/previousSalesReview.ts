import type { Sale } from "./salesService";

export const PREVIOUS_SALES_REVIEW_EVENT = "mylnder:previous-sales-review";

export function getNairobiDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getPreviousNairobiDate(date = new Date()): string {
  const [year, month, day] = getNairobiDate(date).split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}-${String(previous.getUTCDate()).padStart(2, "0")}`;
}

function getStorageKey(adminId: string, saleDate: string): string {
  return `mylnder-sales-reviewed:${adminId}:${saleDate}`;
}

export function isPreviousSalesReviewed(adminId: string, saleDate: string): boolean {
  return localStorage.getItem(getStorageKey(adminId, saleDate)) === "true";
}

export function reviewPreviousSales(adminId: string, saleDate: string, sales: Sale[]): void {
  if (!sales.length || sales.some((sale) => sale.sale_date !== saleDate || sale.admin_id !== adminId)) {
    throw new Error("Previous-day sales must be present before they can be confirmed.");
  }
  localStorage.setItem(getStorageKey(adminId, saleDate), "true");
  window.dispatchEvent(new Event(PREVIOUS_SALES_REVIEW_EVENT));
}
