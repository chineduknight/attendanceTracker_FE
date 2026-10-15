import { ComponentType, Suspense } from "react";
import PageLoader from "../PageLoader";

const WithSuspense =
  <P extends object>(
    Component: ComponentType<P>,
    showLoader = true,
    loaderHeight = "100vh"
  ) =>
  (props: P) => {
    return (
      <Suspense
        fallback={
          showLoader ? (
            <PageLoader h={loaderHeight} label="Loading page..." />
          ) : null
        }
      >
        <Component {...props} />
      </Suspense>
    );
  };
export default WithSuspense;
