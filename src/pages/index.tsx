import Authenticated from "./Authenticated";
import UnAuthenticated from "./UnAuthenticated";

const Pages = () => {
  const isAuthUser = true;
  if (isAuthUser) {
    return <Authenticated />;
  }

  return <UnAuthenticated />;
};

export default Pages;
