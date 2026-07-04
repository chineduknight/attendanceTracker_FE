import { useEffect } from "react";
import useGlobalStore, { EMPTY_USER, EMPTY_ORG } from "zStore";
import { isTokenExpired } from "utils/auth";
import Authenticated from "./Authenticated";
import UnAuthenticated from "./UnAuthenticated";

const Pages = () => {
  const [user, setUser, updateOrganisation] = useGlobalStore((state) => [
    state.user,
    state.setUser,
    state.updateOrganisation,
  ]);

  const hasToken = user.token !== "";
  const expired = hasToken && isTokenExpired(user.token);

  // A persisted-but-expired token should never keep the user "logged in". Clear
  // it so the store matches reality and we drop to the login screen.
  useEffect(() => {
    if (expired) {
      setUser(EMPTY_USER);
      updateOrganisation(EMPTY_ORG);
    }
  }, [expired, setUser, updateOrganisation]);

  if (hasToken && !expired) {
    return <Authenticated />;
  }

  return <UnAuthenticated />;
};

export default Pages;
