import { ComponentType, lazy } from "react";
import WithSuspense from "components/HOC/WithSuspense";

// Route pages take no props: everything they need comes from the URL or store.
type PageModule = { default: ComponentType };

const preloaders: Array<() => Promise<unknown>> = [];

/**
 * A route page loaded on demand that can also be fetched ahead of time with
 * preloadPages(). Once its code has arrived the page renders directly: a
 * React.lazy component suspends for a tick even when its chunk is already
 * downloaded, which would flash the "Loading page..." fallback on every
 * first visit.
 */
export const lazyPage = (load: () => Promise<PageModule>) => {
  let loaded: ComponentType | undefined;
  let pending: Promise<PageModule> | undefined;
  const preload = () => {
    pending ??= load().then(
      (module) => {
        loaded = module.default;
        return module;
      },
      (error) => {
        // A failed chunk (offline, new deploy) is retried on the next try.
        pending = undefined;
        throw error;
      },
    );
    return pending;
  };
  preloaders.push(preload);
  const LazyPage = lazy(preload);
  const Page = () => {
    const Loaded = loaded;
    return Loaded ? <Loaded /> : <LazyPage />;
  };
  // In-app, the page loader sits near the top, where the page's own loader
  // appears, so the spinner does not jump when the page takes over.
  return WithSuspense(Page, true, "30vh");
};

/** Fetch every page's code in the background; failures are ignored. */
export const preloadPages = () => {
  preloaders.forEach((preload) => preload().catch(() => undefined));
};
