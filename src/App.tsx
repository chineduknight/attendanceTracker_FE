import { ChakraProvider } from "@chakra-ui/react";
import { QueryClientProvider } from '@tanstack/react-query'
import { ToastContainer } from "react-toastify";
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import ErrorBoundary from "components/ErrorBoundary";
import theme from "styles/theme";
import Pages from "pages";
import { queryClient } from 'services/api/apiHelper';
import "react-toastify/dist/ReactToastify.css";
import 'react-confirm-alert/src/react-confirm-alert.css';
import "./App.css";

const RenderDevTool = () => {
  if (process.env.NODE_ENV === "development") {
    return <ReactQueryDevtools initialIsOpen={false} />;
  }
  return null;
};
// { process.env.NODE_ENV === 'development' ? <ReactQueryDevtools initialIsOpen={false} /> : null }

const App = () => {
  return (
    <ChakraProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <ToastContainer />
        <ErrorBoundary>
          <Pages />
        </ErrorBoundary>
        <RenderDevTool />
      </QueryClientProvider>
    </ChakraProvider>
  );
};


export default App;
