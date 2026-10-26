import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import ViewMembers from "pages/ViewMembers";
import { system } from "styles/theme";
import { renderRoute } from "test-utils/renderWithProviders";
import { chooseMenuItem, generatedCss, toggle } from "test-utils/render";
import { toast } from "react-toastify";
import { format, parseISO } from "date-fns";
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

  it("names the member term when the list fails to load, and retries", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockGet.mockImplementation(() => Promise.reject(new Error("offline")));
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load students");

    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: { data: url.includes("/model") ? { fields: [] } : [{ id: "member-1", name: "Ada" }] },
      })
    );
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Ada")).toBeInTheDocument();
    (console.error as jest.Mock).mockRestore();
  });

  it("shows availability with attendance.view and navigates to the member route", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/model"))
        return Promise.resolve({ data: { data: { fields: [] } } });
      return Promise.resolve({
        data: { data: [{ id: "member-1", name: "Ada" }] },
      });
    });
    render(
      <ChakraProvider value={system}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/members"]}>
            <Routes>
              <Route path="/members" element={<ViewMembers />} />
              <Route
                path="/member/:memberId/attendance-availability"
                element={<div>availability destination</div>}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ChakraProvider>
    );
    expect(
      await screen.findByRole("button", { name: /^Availability for/ })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Availability for/ }));
    expect(
      await screen.findByText("availability destination")
    ).toBeInTheDocument();
  });

  it("hides availability without attendance.view", async () => {
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        isOwner: false,
        permissions: [],
      },
    });
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/model"))
        return Promise.resolve({ data: { data: { fields: [] } } });
      return Promise.resolve({
        data: { data: [{ id: "member-1", name: "Ada" }] },
      });
    });
    renderPage();
    await screen.findByText("Ada");
    expect(
      screen.queryByRole("button", { name: /^Availability for/ })
    ).not.toBeInTheDocument();
  });
});

describe("<ViewMembers> at phone width", () => {
  const MEMBERS = [
    { id: "m1", name: "Ada", part: "soprano", phone: "0801" },
    { id: "m2", name: "Bayo", part: "tenor", phone: "0802" },
  ];
  const MODEL_FIELDS = [
    { _id: "f1", name: "part", label: "Voice Part", type: "option", options: ["soprano", "tenor"] },
    { _id: "f2", name: "phone", label: "Phone", type: "string" },
  ];

  beforeEach(() => {
    queryClient.clear();
    localStorage.clear();
    useGlobalStore.setState({
      organisation: { ...EMPTY_ORG, id: "org1", isOwner: true },
    });
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/model"))
        return Promise.resolve({ data: { data: { fields: MODEL_FIELDS } } });
      return Promise.resolve({ data: { data: MEMBERS } });
    });
  });

  it("clears the search with one tap and brings the full list back", async () => {
    renderPage();
    await screen.findByText("Ada");
    const search = screen.getByPlaceholderText("Search member");
    fireEvent.change(search, { target: { value: "bay" } });
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 of 2 members");

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(search).toHaveValue("");
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 members");
  });

  it("says why nothing matches and offers to clear the search", async () => {
    renderPage();
    await screen.findByText("Ada");
    fireEvent.change(screen.getByPlaceholderText("Search member"), {
      target: { value: "zz" },
    });
    expect(screen.getByText("No members found")).toBeInTheDocument();
    expect(screen.getByText('Nothing matches "zz".')).toBeInTheDocument();
    // The bar's clear button and the empty state's both clear it.
    const clearButtons = screen.getAllByRole("button", { name: "Clear search" });
    expect(clearButtons).toHaveLength(2);
    fireEvent.click(clearButtons[1]);
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  it("offers to add the first member when there are none", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/model"))
        return Promise.resolve({ data: { data: { fields: MODEL_FIELDS } } });
      return Promise.resolve({ data: { data: [] } });
    });
    renderPage();
    expect(await screen.findByText("No members yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Add member/i }).length).toBe(2);
  });

  it("gives each card's actions a 44px tap target", async () => {
    renderPage();
    await screen.findByText("Ada");
    for (const name of ["Availability for Ada", "Edit Ada"]) {
      const css = generatedCss(screen.getByRole("button", { name }));
      expect(css).toMatch(/min-width:\s*44px/);
      expect(css).toMatch(/height:\s*44px/);
    }
  });

  it("shows field labels, never storage keys, on each card", async () => {
    renderPage();
    await screen.findByText("Ada");
    expect(screen.getAllByText("Voice Part")).toHaveLength(2);
    // Option values render as tags, free text as plain text.
    expect(screen.getByText("soprano")).toHaveClass("chakra-badge");
    expect(screen.getByText("0801")).not.toHaveClass("chakra-badge");
    expect(screen.queryByText("part")).not.toBeInTheDocument();
  });

  it("keeps an empty field choice instead of re-selecting every field", async () => {
    renderPage();
    await screen.findByText("Ada");
    fireEvent.click(screen.getByRole("button", { name: "Fields (2)" }));
    await toggle(await screen.findByRole("checkbox", { name: "Voice Part" }));
    await toggle(screen.getByRole("checkbox", { name: "Phone" }));

    expect(screen.getByRole("button", { name: "Fields (0)" })).toBeInTheDocument();
    expect(screen.queryByText("0801")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("memberListFields-org1")!)).toEqual([])
    );
  });

  it("honours a field choice saved under the legacy key", async () => {
    localStorage.setItem("selectedFields-org1", JSON.stringify(["phone"]));
    renderPage();
    await screen.findByText("Ada");
    expect(screen.getByText("0801")).toBeInTheDocument();
    expect(screen.queryByText("Voice Part")).not.toBeInTheDocument();
  });

  it("filters by option field storage key and counts the active filter", async () => {
    renderPage();
    await screen.findByText("Ada");
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const select = await screen.findByLabelText("Filter by Voice Part");
    fireEvent.keyDown(select, { key: "ArrowDown" });
    fireEvent.click(await screen.findByText("Tenor"));

    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeInTheDocument();
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
    expect(screen.getByText("Bayo")).toBeInTheDocument();
  });

  it("names the member on its edit button and opens that member", async () => {
    render(
      <ChakraProvider value={system}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/members"]}>
            <Routes>
              <Route path="/members" element={<ViewMembers />} />
              <Route path="/member/update/:memberId" element={<div>edit destination</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ChakraProvider>
    );
    fireEvent.click(await screen.findByRole("button", { name: "Edit Bayo" }));
    expect(await screen.findByText("edit destination")).toBeInTheDocument();
  });

  it("hides add and edit without members.manage but keeps export", async () => {
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        isOwner: false,
        permissions: ["members.view"],
      },
    });
    renderPage();
    await screen.findByText("Ada");
    expect(screen.queryByRole("button", { name: /edit ada/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Member" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });
});

describe("<ViewMembers> keeps its list in the address", () => {
  const MEMBERS = [
    { id: "m1", name: "Ada", part: "soprano" },
    { id: "m2", name: "Bayo", part: "tenor" },
  ];
  const MODEL_FIELDS = [
    {
      _id: "f1",
      name: "part",
      label: "Voice Part",
      type: "option",
      options: ["soprano", "tenor"],
    },
  ];

  // Shows the address the page wrote, as a refresh or Back would find it.
  const LocationProbe = () => {
    const location = useLocation();
    return <output data-testid="location">{location.search}</output>;
  };
  const shownSearch = () =>
    new URLSearchParams(screen.getByTestId("location").textContent ?? "");

  const renderAt = (path = "/members") =>
    renderRoute(
      <>
        <ViewMembers />
        <LocationProbe />
      </>,
      "/members",
      path
    );

  beforeEach(() => {
    queryClient.clear();
    localStorage.clear();
    useGlobalStore.setState({
      organisation: { ...EMPTY_ORG, id: "org1", isOwner: true },
    });
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/model"))
        return Promise.resolve({ data: { data: { fields: MODEL_FIELDS } } });
      return Promise.resolve({ data: { data: MEMBERS } });
    });
  });

  it("restores filters and the name search from the address", async () => {
    renderAt("/members?filter.part=tenor&q=bay");
    expect(await screen.findByText("Bayo")).toBeInTheDocument();
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search member")).toHaveValue("bay");
  });

  it("writes a selected filter to the address", async () => {
    renderAt();
    await screen.findByText("Ada");
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const select = await screen.findByLabelText("Filter by Voice Part");
    fireEvent.keyDown(select, { key: "ArrowDown" });
    fireEvent.click(await screen.findByText("Tenor"));

    expect(shownSearch().getAll("filter.part")).toEqual(["tenor"]);
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
    expect(screen.getByText("Bayo")).toBeInTheDocument();
  });

  it("writes the name search to the address and clears it there", async () => {
    renderAt();
    await screen.findByText("Ada");
    fireEvent.change(screen.getByPlaceholderText("Search member"), {
      target: { value: "bay" },
    });
    expect(shownSearch().get("q")).toBe("bay");
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(shownSearch().get("q")).toBeNull();
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  it("drops filters the organisation's model no longer offers", async () => {
    renderAt("/members?filter.part=mezzo&filter.voice=bass&filter.part=tenor");
    expect(await screen.findByText("Bayo")).toBeInTheDocument();
    // The valid tenor filter stays; the unknown field and option are dropped.
    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeInTheDocument();
    await waitFor(() =>
      expect(shownSearch().toString()).toBe("filter.part=tenor")
    );
  });

  it("hands the edit page the working list to return to", async () => {
    const EditProbe = () => {
      const location = useLocation();
      return (
        <output data-testid="edit-state">{JSON.stringify(location.state)}</output>
      );
    };
    render(
      <ChakraProvider value={system}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/members?q=bay&filter.part=tenor"]}>
            <Routes>
              <Route path="/members" element={<ViewMembers />} />
              <Route path="/member/update/:memberId" element={<EditProbe />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ChakraProvider>
    );
    expect(await screen.findByText("Bayo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Bayo" }));

    const state = JSON.parse(
      screen.getByTestId("edit-state").textContent ?? "{}"
    );
    const returned = new URL(state.returnTo, "http://x");
    expect(returned.pathname).toBe("/members");
    expect(returned.searchParams.get("q")).toBe("bay");
    expect(returned.searchParams.getAll("filter.part")).toEqual(["tenor"]);
  });
});

describe("<ViewMembers> audit fields", () => {
  beforeEach(() => {
    queryClient.clear();
    localStorage.clear();
    useGlobalStore.setState({
      organisation: { ...EMPTY_ORG, id: "org1", isOwner: true },
    });
  });

  it("shows who created and updated a member by name, not [object Object]", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/model"))
        return Promise.resolve({ data: { data: { fields: [] } } });
      return Promise.resolve({
        data: {
          data: [
            {
              id: "m1",
              name: "Ada",
              dob: "2001-03-04T00:00:00.000Z",
              createdBy: { id: "u1", name: "knight" },
              updatedBy: null,
            },
          ],
        },
      });
    });
    renderPage();
    await screen.findByText("Ada");
    expect(screen.getByText("Created by")).toBeInTheDocument();
    expect(screen.getByText("knight")).toBeInTheDocument();
    expect(screen.getByText("Updated by")).toBeInTheDocument();
    expect(screen.getByText("04-Mar-2001")).toBeInTheDocument();
    expect(screen.queryByText(/object Object/)).not.toBeInTheDocument();
  });

  it("shows when a member was created and last updated beside who did it", async () => {
    const createdAt = "2026-01-05T08:02:00.000Z";
    const updatedAt = "2026-10-14T15:18:00.000Z";
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/model"))
        return Promise.resolve({ data: { data: { fields: [] } } });
      return Promise.resolve({
        data: {
          data: [
            {
              id: "m1",
              name: "Ada",
              createdBy: { id: "u1", name: "knight" },
              createdAt,
              updatedBy: { id: "u2", name: "bayo" },
              updatedAt,
            },
          ],
        },
      });
    });
    renderPage();
    await screen.findByText("Ada");
    // Rendered in local time, so the expectations use the same formatter.
    const shown = (timestamp: string) =>
      format(parseISO(timestamp), "dd-MMM-yyyy, h:mm a");
    expect(screen.getByText("knight")).toBeInTheDocument();
    expect(screen.getByText(shown(createdAt))).toBeInTheDocument();
    expect(screen.getByText("bayo")).toBeInTheDocument();
    expect(screen.getByText(shown(updatedAt))).toBeInTheDocument();
  });

  const exportMembersList = async () => {
    await screen.findByText("Ada");
    const exportButton = screen.getByRole("button", { name: "Export" });
    await waitFor(() => expect(exportButton).toBeEnabled());
    fireEvent.click(exportButton);
    await chooseMenuItem(
      await screen.findByRole("menuitem", { name: "Export Member List" })
    );
  };

  const mockMembersWithAuditFields = (exportResponse: () => Promise<unknown>) =>
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/export")) return exportResponse();
      if (url.includes("/model"))
        return Promise.resolve({
          data: {
            data: {
              fields: [
                { name: "name", type: "string" },
                { name: "dob", type: "date" },
              ],
            },
          },
        });
      return Promise.resolve({
        data: {
          data: [
            {
              id: "m1",
              name: "Ada",
              dob: "2001-03-04",
              financialStartDate: null,
              createdBy: { id: "u1", name: "knight" },
              updatedBy: null,
            },
          ],
        },
      });
    });

  it("exports only member-model fields, never server-owned keys", async () => {
    const open = jest.spyOn(window, "open").mockImplementation(() => null);
    mockMembersWithAuditFields(() =>
      Promise.resolve({ data: { data: "https://files/members.xlsx" } })
    );
    renderPage();
    await exportMembersList();
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith("https://files/members.xlsx", "_blank")
    );
    const exportUrl: string = mockGet.mock.calls
      .map(([url]) => url as string)
      .find((url) => url.includes("/export"))!;
    const fields = new URLSearchParams(exportUrl.split("?")[1]).get("fields");
    expect(fields?.split(",")).toEqual(["name", "dob"]);
    open.mockRestore();
  });

  it("shows the backend's error when an export fails", async () => {
    const toastError = jest.spyOn(toast, "error");
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockMembersWithAuditFields(() =>
      Promise.reject({
        response: { status: 400, data: { error: "Invalid field(s): x" } },
      })
    );
    renderPage();
    await exportMembersList();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Invalid field(s): x")
    );
    toastError.mockRestore();
    consoleError.mockRestore();
  });
});
