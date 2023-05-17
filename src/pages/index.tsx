import useGlobalStore from "zStore";
import Authenticated from "./Authenticated";
import UnAuthenticated from "./UnAuthenticated";

const Pages = () => {
  const [user] = useGlobalStore((state) => [state.user]);

  const isAuthUser = user.token !== "";
  if (isAuthUser) {
    return <Authenticated />;
  }

  return <UnAuthenticated />;
};

export default Pages;
