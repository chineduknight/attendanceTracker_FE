import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { confirmAlert } from "react-confirm-alert";
import theme from "styles/theme";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import AddMember from "pages/AddMember";
import { PROTECTED_PATHS } from "routes/pagePath";

jest.mock("react-toastify", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("react-confirm-alert", () => ({ confirmAlert: jest.fn() }));
jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockedAxios = require("services/api").default;
const mockGet: jest.Mock = mockedAxios.get;
const mockPost: jest.Mock = mockedAxios.post;
const mockConfirm = confirmAlert as jest.Mock;

// `part` was relabelled to "Voice Part"; its key and options are unchanged.
const MODEL = {
  fields: [
    { _id: "f-name", name: "name", label: "Full Name", type: "text", required: true },
    { _id: "f-part", name: "part", label: "Voice Part", type: "option", options: ["Soprano", "Alto"], required: false },
  ],
};
const ADA = { id: "m1", name: "Ada", part: "Alto" };

const renderAt = (path: string) =>
  render(
    <ChakraProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={PROTECTED_PATHS.ADD_MEMBER} element={<AddMember />} />
            <Route path={PROTECTED_PATHS.UPDATE_MEMBER} element={<AddMember />} />
            <Route path={PROTECTED_PATHS.VIEW_MEMBER} element={<div>members list</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ChakraProvider>,
  );

const confirmSubmit = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Submit|Update/ }));
  await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
  mockConfirm.mock.calls[0][0].buttons[0].onClick();
  await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
  return mockPost.mock.calls[0];
};

describe("<AddMember> with display labels", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    useGlobalStore.setState({ organisation: { ...EMPTY_ORG, id: "org1", permissions: [] } });
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: { data: url.endsWith("/model") ? MODEL : ADA } }),
    );
    mockPost.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
  });

  it("shows labels but submits values under the storage keys only", async () => {
    renderAt(PROTECTED_PATHS.ADD_MEMBER);
    expect(await screen.findByLabelText(/Full Name/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Full Name/), { target: { value: "Bola" } });
    fireEvent.change(screen.getByLabelText("Voice Part"), { target: { value: "Soprano" } });

    const [url, body] = await confirmSubmit();

    expect(url).toBe("/organisations/org1/members");
    expect(body).toEqual({ name: "Bola", part: "Soprano" });
  });

  it("prefills an existing member's saved value after a label-only rename", async () => {
    renderAt("/member/update/m1");
    const part = (await screen.findByLabelText("Voice Part")) as HTMLSelectElement;
    await waitFor(() => expect(part.value).toBe("Alto"));

    const [, body] = await confirmSubmit();

    expect(body).toMatchObject({ name: "Ada", part: "Alto", memberId: "m1" });
    expect(body).not.toHaveProperty("label");
    expect(body).not.toHaveProperty("_id");
    expect(body).not.toHaveProperty("Voice Part");
  });
});
