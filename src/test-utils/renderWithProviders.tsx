import { ReactElement } from "react";
import { render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import { system } from "styles/theme";

/** Render `element` at `path` (matched by `routePath`) inside app providers. */
export const renderRoute = (
  element: ReactElement,
  routePath: string,
  path: string,
) =>
  render(
    <ChakraProvider value={system}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={routePath} element={element} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ChakraProvider>,
  );
