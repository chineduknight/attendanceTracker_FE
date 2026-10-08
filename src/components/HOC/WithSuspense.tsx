import { ComponentType, Suspense } from "react";
import PageLoader from "../PageLoader";

const WithSuspense =
  <P extends object>(Component: ComponentType<P>, showLoader = true) =>
  (props: P) => {
    return (
      <Suspense
        fallback={
          showLoader ? <PageLoader h="100vh" label="Loading page..." /> : null
        }
      >
        <Component {...props} />
      </Suspense>
    );
  };
export default WithSuspense;
