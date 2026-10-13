import { QueryClientProvider } from '@tanstack/react-query'
import { ToastContainer } from "react-toastify";
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import ErrorBoundary from "components/ErrorBoundary";
import { Provider } from "components/ui/provider";
import { useColorMode } from "components/ui/color-mode";
import Pages from "pages";
import { queryClient } from 'services/api/apiHelper';
import "react-toastify/dist/ReactToastify.css";
import "./App.css";

const RenderDevTool = () => {
  if (process.env.NODE_ENV === "development") {
    return <ReactQueryDevtools initialIsOpen={false} />;
  }
  return null;
};


const ThemedToastContainer = () => {
  const { colorMode } = useColorMode();
  return <ToastContainer theme={colorMode} />;
};

const App = () => {
  return (
    <Provider>
      <QueryClientProvider client={queryClient}>
        <ThemedToastContainer />
        <ErrorBoundary>
          <Pages />
        </ErrorBoundary>
        <RenderDevTool />
      </QueryClientProvider>
    </Provider>
  );
};


export default App;
