import { screen } from "@testing-library/react";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import ViewMembers from "pages/ViewMembers";
import { renderRoute } from "test-utils/renderWithProviders";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockGet: jest.Mock = require("services/api").default.get;

// Chakra's useBreakpointValue needs matchMedia, which jsdom doesn't implement.
window.matchMedia =
  window.matchMedia ||
  ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    } as unknown as MediaQueryList));

const SCHOOL_TERMS = {
  ...DEFAULT_TERMINOLOGY,
  memberSingular: "Student",
  memberPlural: "Students",
  attendanceSingular: "Session",
  attendancePlural: "Sessions",
};

const renderPage = () => renderRoute(<ViewMembers />, "/members", "/members");

describe("<ViewMembers> with custom terminology", () => {
  beforeEach(() => {
    queryClient.clear();
    localStorage.clear();
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        isOwner: true,
        terminology: SCHOOL_TERMS,
      },
    });
  });

  it("names the member term while loading", async () => {
    mockGet.mockImplementation(() => new Promise(() => undefined));
    renderPage();
    expect(await screen.findByText("Loading students...")).toBeInTheDocument();
  });

  it("names the member term when the list fails to load", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockGet.mockImplementation(() => Promise.reject(new Error("offline")));
    renderPage();
    expect(
      await screen.findByText("Error occurred while fetching students."),
    ).toBeInTheDocument();
    (console.error as jest.Mock).mockRestore();
  });
});
