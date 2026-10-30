import { fireEvent, screen, waitFor } from "@testing-library/react";
import { queryClient } from "services/api/apiHelper";
import AddOrganisation from "pages/AddOrganisation";
import { renderRoute } from "test-utils/renderWithProviders";

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

const renderPage = () => renderRoute(<AddOrganisation />, "/add-org", "/add-org");
const typeName = (value: string) =>
  fireEvent.change(screen.getByLabelText(/Organisation name/), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole("button", { name: /Create organisation|Creating/ }));

describe("<AddOrganisation>", () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
  });

  it("leaves for the list only after the organisation is created", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    api.post.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPage();
    typeName("  Seat of Wisdom  ");
    submit();
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/organisations", { name: "Seat of Wisdom" }));
    expect(mockNavigate).not.toHaveBeenCalled();

    // A second tap while saving sends nothing more.
    submit();
    expect(api.post).toHaveBeenCalledTimes(1);

    resolve({ data: { data: { id: "new" } } });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/organisations"));
  });

  it("stays on the form with the backend error when creation fails", async () => {
    api.post.mockRejectedValue({ response: { status: 422, data: { error: "Name already taken" } } });
    renderPage();
    typeName("Demo Choir");
    submit();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Name already taken", {
        toastId: "Name already taken",
      }),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Organisation name/)).toHaveValue("Demo Choir");
  });

  it("asks for a name instead of sending a blank one", async () => {
    renderPage();
    typeName("   ");
    submit();
    expect(await screen.findByText("Enter a name")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
