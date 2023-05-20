import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from "axios";
import { toast } from "react-toastify";
import useGlobalStore from "zStore";

export const baseURL = process.env.REACT_APP_BASE_URL;
export * from "./request";

const axiosInstance: AxiosInstance = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
  },
});
// https://dev.to/charlintosh/setting-up-axios-interceptors-react-js-typescript-12k5
// This adds a token before all the requests.
// https://stackoverflow.com/questions/57251719/acquiring-a-new-token-with-axios-interceptors
const onRequest = (request: AxiosRequestConfig): AxiosRequestConfig => {
  const token = "Bearer " + useGlobalStore.getState().user.token;
  request.headers!.Authorization = token || "";
  return request;
};

const onRequestError = (error: AxiosError): Promise<AxiosError> => {
  return Promise.reject(error);
};

const onResponse = (response: AxiosResponse): AxiosResponse => {
  return response;
};
interface ErrorResponse {
  error?: string;
  // define other properties if needed
}
const onResponseError = (error: AxiosError): Promise<AxiosError> => {
  if (error.response) {
    const statusCode = error.response.status;
    const data = error.response.data as ErrorResponse;
    const errMsg = data.error || "Authentication Error";
    if (statusCode === 401) {
      // logout user
      toast.error(errMsg);
      useGlobalStore.setState({
        user: {
          token: "",
          id: "",
          username: "",
        },
      });
    }
  } else {
    // Handle error without response (network error, request cancelled, etc.)
    console.error(error);
  }
  return Promise.reject(error);
};

// https://axios-http.com/docs/interceptors
axiosInstance.interceptors.request.use(onRequest, onRequestError);
axiosInstance.interceptors.response.use(onResponse, onResponseError);

export default axiosInstance;
