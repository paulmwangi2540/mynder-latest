import { useEffect } from "react";
export default function useToastFeedback(
  error?: string | null,
  success?: string | null,
) {
  useEffect(() => {
    if (error) {
      void import("sonner").then(({ toast }) =>
        toast.error(error, { id: `admin-error-${error}`, duration: 4_000 }),
      );
    }
  }, [error]);

  useEffect(() => {
    if (success) {
      void import("sonner").then(({ toast }) =>
        toast.success(success, { id: `admin-success-${success}`, duration: 4_000 }),
      );
    }
  }, [success]);
}
