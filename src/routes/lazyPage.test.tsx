import { act, screen } from "@testing-library/react";
import { render } from "test-utils/render";
import { lazyPage, preloadPages } from "routes/lazyPage";

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe("lazyPage", () => {
  it("renders a preloaded page directly, without the Loading page fallback", async () => {
    const Page = lazyPage(() =>
      Promise.resolve({ default: () => <p>welfare page</p> })
    );
    preloadPages();
    await flush();

    render(<Page />);
    // Synchronously present: no Suspense tick, so no fallback flash.
    expect(screen.getByText("welfare page")).toBeInTheDocument();
    expect(screen.queryByText("Loading page...")).not.toBeInTheDocument();
  });

  it("shows the fallback until a page that was not preloaded arrives", async () => {
    const Page = lazyPage(() =>
      Promise.resolve({ default: () => <p>finance page</p> })
    );
    render(<Page />);
    expect(screen.getByText("Loading page...")).toBeInTheDocument();
    expect(await screen.findByText("finance page")).toBeInTheDocument();
  });

  it("downloads each page once and retries one whose download failed", async () => {
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ default: () => <p>members page</p> });
    lazyPage(load);

    preloadPages();
    await flush();
    preloadPages();
    await flush();
    preloadPages();
    await flush();
    // The failure is retried once; the success is never fetched again.
    expect(load).toHaveBeenCalledTimes(2);
  });
});
