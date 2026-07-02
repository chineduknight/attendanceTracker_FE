import ScrollToTop from "components/ScrollToTop";
import { BrowserRouter as Router, useRoutes } from "react-router-dom";
import PROTECTED_ROUTES from "routes/protectedRoutes";
import { useQueryWrapper } from "services/api/apiHelper";
import { authRequest } from "services";
import useGlobalStore from "zStore";
import { MeResponse } from "rbac/types";

const AppWrapper = () => useRoutes(PROTECTED_ROUTES);

const Authenticated = () => {
  const [user, setUser] = useGlobalStore((s) => [s.user, s.setUser]);

  useQueryWrapper(["me"], authRequest.GET_ME, {
    onSuccess: (res: { data: MeResponse }) =>
      setUser({ ...user, ...res.data }),
  });

  return (
    <Router>
      <ScrollToTop />
      <AppWrapper />
    </Router>
  );
};
export default Authenticated;
