import { fireEvent, screen, waitFor } from "@testing-library/react";
import { queryClient } from "services/api/apiHelper";
import Login from "pages/Login";
import Signup from "pages/Signup";
import ForgotPassword from "pages/ForgotPassword";
import ResetPassword from "pages/ResetPassword";
import BrandMark from "components/auth/BrandMark";
import { renderRoute } from "test-utils/renderWithProviders";
import { generatedCss, render } from "test-utils/render";
import useGlobalStore, { EMPTY_USER } from "zStore";

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { post: jest.fn() },
}));
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as { post: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { toast } = require("react-toastify");

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { selector: "input" }), { target: { value } });
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
  useGlobalStore.getState().setUser(EMPTY_USER);
});

describe("<Login>", () => {
  const renderLogin = () => renderRoute(<Login />, "/login", "/login");

  it("asks for both fields instead of sending an empty form", async () => {
    renderLogin();
    press("Sign in");
    expect(await screen.findByText("Enter your username or email")).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("signs in with the typed details and stores the session", async () => {
    const user = { token: "t1", id: "u1", username: "ada", email: "ada@x.com", needsEmail: false };
    api.post.mockResolvedValue({ data: { data: user } });
    renderLogin();
    type(/Username or email/, "Ada");
    type(/^Password/, "secret1");
    press("Sign in");
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/users/login", { username: "Ada", password: "secret1" }),
    );
    await waitFor(() => expect(useGlobalStore.getState().user.token).toBe("t1"));
  });

  it("keeps the phone from capitalising or correcting the username", () => {
    renderLogin();
    const username = screen.getByLabelText(/Username or email/);
    expect(username).toHaveAttribute("autocapitalize", "none");
    expect(username).toHaveAttribute("autocorrect", "off");
    expect(username).toHaveAttribute("spellcheck", "false");
  });

  it("has no Remember me option", () => {
    renderLogin();
    expect(screen.queryByText(/Remember me/)).not.toBeInTheDocument();
  });
});

describe("<Signup>", () => {
  const renderSignup = () => renderRoute(<Signup />, "/signup", "/signup");
  const fill = (password: string, confirm: string) => {
    type(/^Username/, "ada");
    type(/^Email/, "ada@example.com");
    type(/^Password/, password);
    type(/^Confirm password/, confirm);
  };

  it("stops when the passwords do not match", async () => {
    renderSignup();
    fill("secret1", "secret2");
    press("Create account");
    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("checks the email and password length before sending", async () => {
    renderSignup();
    type(/^Username/, "ada");
    type(/^Email/, "not-an-email");
    type(/^Password/, "123");
    type(/^Confirm password/, "123");
    press("Create account");
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 6 characters")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("sends the account without the confirmation field", async () => {
    api.post.mockResolvedValue({ data: { data: { token: "t2" } } });
    renderSignup();
    fill("secret1", "secret1");
    press("Create account");
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/users/signup", {
        username: "ada",
        email: "ada@example.com",
        password: "secret1",
      }),
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
  });
});

describe("<ForgotPassword>", () => {
  const renderForgot = () => renderRoute(<ForgotPassword />, "/forgot-password", "/forgot-password");

  it("shows Check your inbox for the address, and can go back to the form", async () => {
    api.post.mockResolvedValue({ data: { data: {} } });
    renderForgot();
    type(/^Email/, "ada@example.com");
    press("Send reset link");
    expect(await screen.findByRole("heading", { name: "Check your inbox" })).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/users/forgot-password", { email: "ada@example.com" });

    press("Try a different address");
    expect(await screen.findByRole("button", { name: "Send reset link" })).toBeInTheDocument();
  });

  it("explains a rate limit instead of claiming the email was sent", async () => {
    api.post.mockRejectedValue({ response: { status: 429 } });
    renderForgot();
    type(/^Email/, "ada@example.com");
    press("Send reset link");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Too many attempts, please try again later."));
    expect(screen.queryByText("Check your inbox")).not.toBeInTheDocument();
  });
});

describe("<ResetPassword>", () => {
  const renderReset = (search = "?token=abc") =>
    renderRoute(<ResetPassword />, "/reset-password", `/reset-password${search}`);
  const fill = () => {
    type(/^New password/, "secret9");
    type(/^Confirm new password/, "secret9");
  };

  it("shows the invalid-link message when the link has no token", () => {
    renderReset("");
    expect(screen.getByRole("heading", { name: /invalid or expired/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request a new reset link" })).toHaveAttribute("href", "/forgot-password");
  });

  it("swaps to the invalid-link message when the server rejects the token", async () => {
    api.post.mockRejectedValue({ response: { status: 422, data: { error: "Reset token is invalid or expired" } } });
    renderReset();
    fill();
    press("Reset password");
    expect(await screen.findByRole("heading", { name: /invalid or expired/ })).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/users/reset-password", { token: "abc", password: "secret9" });
  });

  it("sends the new password and returns to sign in", async () => {
    api.post.mockResolvedValue({ data: { data: {} } });
    renderReset();
    fill();
    press("Reset password");
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/login"));
    expect(toast.success).toHaveBeenCalledWith("Password has been reset. Please sign in.");
  });
});

describe("<BrandMark>", () => {
  it("paints the wordmark with a gradient so the name is visible", () => {
    render(<BrandMark />);
    const wordmark = screen.getByTestId("brand-wordmark");
    expect(wordmark).toHaveTextContent("Presence Pro");
    expect(generatedCss(wordmark)).toMatch(/linear-gradient/);
    expect(generatedCss(wordmark)).toMatch(/background-clip: text/);
  });
});
