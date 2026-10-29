import { useEffect, useState } from "react";
import {
  isPreviousSalesReviewed,
  PREVIOUS_SALES_REVIEW_EVENT,
} from "../services/previousSalesReview";

export default function usePreviousSalesReviewStatus(
  adminId: string | null | undefined,
  saleDate: string,
): boolean {
  const [reviewed, setReviewed] = useState(false);

  useEffect(() => {
    const sync = () => {
      setReviewed(Boolean(adminId) && isPreviousSalesReviewed(adminId ?? "", saleDate));
    };
    sync();
    window.addEventListener(PREVIOUS_SALES_REVIEW_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PREVIOUS_SALES_REVIEW_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [adminId, saleDate]);

  return reviewed;
}
