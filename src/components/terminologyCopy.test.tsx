import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ReactElement } from "react";
import theme from "styles/theme";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import { DEFAULT_TERMINOLOGY, OrganisationTerminology } from "helpers/organisationPresentation";
import StartDatesTab from "components/finance/StartDatesTab";
import CollectTab from "components/finance/CollectTab";
import PendingInvitesTab from "components/officers/PendingInvitesTab";
import QuickMarkToolbar from "components/attendance/QuickMarkToolbar";
import { Obligation } from "components/finance/financeTypes";

jest.mock("react-toastify", () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }));
jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockGet: jest.Mock = require("services/api").default.get;

const SCHOOL: OrganisationTerminology = {
  ...DEFAULT_TERMINOLOGY,
  memberSingular: "Student",
  memberPlural: "Students",
  officerSingular: "Coordinator",
  officerPlural: "Coordinators",
};

// An obligation whose compliance has no rows renders the empty-table message.
const EMPTY_COMPLIANCE = {
  obligation: { id: "ob1", type: "levy", name: "Building levy", amount: 1000 },
  summary: { totalMembers: 0, accountableMembers: 0, totalCollected: 0, totalOutstanding: 0 },
  rows: [],
};

const renderWithTerms = (ui: ReactElement, terminology: OrganisationTerminology) => {
  useGlobalStore.setState({
    organisation: { ...EMPTY_ORG, id: "org1", isOwner: true, permissions: [], terminology },
  });
  return render(
    <ChakraProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </ChakraProvider>,
  );
};

describe("terminology in finance and officer copy", () => {
  beforeEach(() => {
    queryClient.clear();
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: { data: url.includes("/compliance") ? EMPTY_COMPLIANCE : [] } }),
    );
  });

  it.each([
    [DEFAULT_TERMINOLOGY, "Member start dates"],
    [SCHOOL, "Student start dates"],
  ])("titles finance start dates with the member term", async (terms, heading) => {
    renderWithTerms(<StartDatesTab organisationId="org1" />, terms);
    expect(await screen.findByText(heading)).toBeInTheDocument();
  });

  it.each([
    [DEFAULT_TERMINOLOGY, "No members yet."],
    [SCHOOL, "No students yet."],
  ])("uses the member plural in the collect empty state", async (terms, message) => {
    renderWithTerms(
      <CollectTab
        organisationId="org1"
        obligations={[EMPTY_COMPLIANCE.obligation as Obligation]}
        obligationId="ob1"
        onObligationChange={jest.fn()}
      />,
      terms,
    );
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it.each([
    [DEFAULT_TERMINOLOGY, /they'll appear as an officer automatically\./],
    [SCHOOL, /they'll appear as a coordinator automatically\./],
  ])("explains pending invites with the officer term", async (terms, copy) => {
    renderWithTerms(<PendingInvitesTab organisationId="org1" />, terms);
    expect(await screen.findByText(copy)).toBeInTheDocument();
  });

  it.each([
    [DEFAULT_TERMINOLOGY, "Tap a member to"],
    [SCHOOL, "Tap a student to"],
  ])("labels the quick-mark modes with the member term", (terms, label) => {
    renderWithTerms(<QuickMarkToolbar statuses={[]} mode={null} onModeChange={jest.fn()} />, terms);
    expect(screen.getByRole("group", { name: label })).toBeInTheDocument();
  });
});

