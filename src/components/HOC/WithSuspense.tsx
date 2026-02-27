import { ComponentType, Suspense } from "react";
import LoadingSpinner from "../LoadingSpinner";

const WithSuspense =
  <P extends object>(Component: ComponentType<P>, showLoader = true) =>
  (props: P) => {
    return (
      <Suspense
        fallback={
          showLoader ? <LoadingSpinner h="100vh" text="Loading page..." /> : null
        }
      >
        <Component {...props} />
      </Suspense>
    );
  };
export default WithSuspense;
