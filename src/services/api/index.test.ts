import { toast } from "react-toastify";
import useGlobalStore, { EMPTY_USER } from "zStore";
import { onResponseError } from "services/api";
import { authRequest } from "services/api/request";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn() },
}));

const mockError = toast.error as jest.Mock;

const unauthorized = (message: string, url = "/organisations/o1/members") =>
  ({
    config: { url },
    response: { status: 401, data: { error: message } },
  } as any);

describe("the global 401 handler", () => {
  beforeEach(() => {
    mockError.mockClear();
    useGlobalStore.setState({
      user: { ...EMPTY_USER, token: "token", id: "user-1" },
    });
  });

  it("gives a burst of refusals one stable toast id and signs the user out", async () => {
    const first = unauthorized("Session expired");
    await expect(onResponseError(first)).rejects.toBe(first);
    const second = unauthorized("Session expired");
    await expect(onResponseError(second)).rejects.toBe(second);

    const ids = mockError.mock.calls.map(([, options]) => options.toastId);
    expect(ids).toEqual(["auth-Session expired", "auth-Session expired"]);
    expect(mockError).toHaveBeenCalledWith("Session expired", {
      toastId: "auth-Session expired",
    });
    expect(useGlobalStore.getState().user).toEqual(EMPTY_USER);
  });

  it("falls back to the authentication wording when the body has no error", async () => {
    const refused = {
      config: { url: "/organisations/o1/members" },
      response: { status: 401, data: {} },
    } as any;
    await expect(onResponseError(refused)).rejects.toBe(refused);

    expect(mockError).toHaveBeenCalledWith("Authentication Error", {
      toastId: "auth-Authentication Error",
    });
  });

  it("still lets the change-password 401 reach its form", async () => {
    const wrongPassword = unauthorized(
      "Current password is incorrect",
      authRequest.UPDATE_PASSWORD,
    );
    await expect(onResponseError(wrongPassword)).rejects.toBe(wrongPassword);

    expect(mockError).not.toHaveBeenCalled();
    expect(useGlobalStore.getState().user.token).toBe("token");
  });
});
