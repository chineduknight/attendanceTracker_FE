import { toast } from "react-toastify";

export const openExportUrl = (response: any, format: "PDF" | "Excel"): void => {
  const exportUrl =
    typeof response?.data === "string" ? response.data.trim() : "";
  if (exportUrl) {
    window.open(exportUrl, "_blank", "noopener,noreferrer");
    return;
  }
  const responseError =
    typeof response?.error === "string"
      ? response.error
      : `Failed to export ${format}.`;
  toast.error(responseError);
};

export const handleExportError = (err: any, format: "PDF" | "Excel"): void => {
  const statusCode = err?.response?.status;
  if (statusCode === 401) return;
  const apiError = err?.response?.data?.error;
  let message: string;
  if (Array.isArray(apiError)) {
    message = apiError.filter(Boolean).join(", ");
  } else if (typeof apiError === "string" && apiError.trim()) {
    message = apiError;
  } else {
    message = `Failed to export ${format}. Please try again.`;
  }
  toast.error(message);
};
