import { useQuery , useMutation, QueryClient, QueryKey } from "@tanstack/react-query";
import axiosInstance from ".";
import { toast } from "react-toastify";

export const useQueryWrapper = (key: QueryKey, url: string, options?: any) => {
  const getAPICall = async () => {
    const response = await axiosInstance.get(url);
    return response.data;
  };
  return useQuery(key, getAPICall, options);
};

export const postRequest = async ({ url, data }: any) => {
  const response = await axiosInstance.post(url, data);
  return response?.data || response;
};

export const putRequest = async ({ url, data }: any) => {
  const response = await axiosInstance.put(url, data);
  return response?.data || response;
};
export const patchRequest = async ({ url, data }: any) => {
  const response = await axiosInstance.patch(url, data);
  return response?.data || response;
};

export const deleteRequest = async ({ url, data }: any) => {
  const config = { data };
  const response = await axiosInstance.delete(url, config);
  return response?.data || response;
};

/**
 * The default mutation failure: one toast for the backend's message(s).
 *
 * A validation response can list several messages; one toast per message used
 * to stack up to a screenful, so they are joined into a single toast (kept
 * open until dismissed). Repeated identical messages share a toast id, so a
 * retry or a burst of the same failure replaces the toast instead of adding
 * another copy.
 */
export const showMutationError = (error: unknown) => {
  const err = error as Record<any, any>;
  const statusCode = err?.response?.status;

  // 401 errors are already handled by the global axios interceptor.
  if (statusCode === 401) {
    return;
  }

  const message: unknown = err?.response?.data?.error;
  const messages = (Array.isArray(message) ? message : [message])
    .map((item) => `${item ?? "An error occured"}`)
    .filter((item) => item.trim() !== "");
  const text = messages.length ? messages.join(" • ") : "An error occured";

  if (Array.isArray(message)) {
    // A validation list is meant to be read; it stays until dismissed.
    toast.error(text, { autoClose: false, toastId: text });
  } else {
    toast.error(text, { toastId: text });
  }
};

// TODO: write JSDocs for this function
export const useMutationWrapper = (makeAPICall: any, onSuccess?: any, onError?: any): any => {
  return useMutation(makeAPICall, {
    onSuccess: (res) => {
      if (onSuccess) {
        onSuccess(res);
      }
    },

    onError: (error: any) => {
      if (onError) {
        onError(error);
      } else {
        showMutationError(error);
      }
    },
  });
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      // staleTime: 1000 * 600, // this is in millisecond
      retry: 0,
    },
  },
});

// export const queryClient = new QueryClient({});
