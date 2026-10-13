import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { render } from "test-utils/render";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import axiosInstance from "services/api";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import Category from "pages/Category";
import SubCategory from "pages/SubCategory";

jest.mock("react-toastify", () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const renderPage = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

const setOrg = (id: string) =>
  act(() => {
    useGlobalStore.setState({ organisation: { ...EMPTY_ORG, id } });
  });

let invalidateSpy: jest.SpyInstance;
let getSpy: jest.SpyInstance;
let postSpy: jest.SpyInstance;

beforeEach(() => {
  queryClient.clear();
  useGlobalStore.setState({ organisation: EMPTY_ORG });
  invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");
  getSpy = jest.spyOn(axiosInstance, "get").mockImplementation((url: string) => {
    if (url === "/organisations/orgA/category") {
      return Promise.resolve({
        data: { data: [{ id: "c1", name: "Choir", status: "active", subCategories: [] }] },
      });
    }
    return Promise.resolve({ data: { data: [] } });
  });
  postSpy = jest.spyOn(axiosInstance, "post").mockResolvedValue({ data: { data: {} } });
});

afterEach(() => {
  invalidateSpy.mockRestore();
  getSpy.mockRestore();
  postSpy.mockRestore();
});

describe("category create cache invalidation", () => {
  it("invalidates only the current organisation's categories", async () => {
    setOrg("orgA");
    renderPage(<Category />);

    fireEvent.change(screen.getByLabelText(/Category name/i), {
      target: { value: "Choir" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add category" }));

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.categories("orgA"),
      })
    );
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: queryKeys.categories("orgB"),
    });
  });
});

describe("sub-category create cache invalidation", () => {
  it("invalidates only the current organisation's categories", async () => {
    setOrg("orgA");
    renderPage(<SubCategory />);

    const select = await screen.findByRole("combobox");
    await screen.findByRole("option", { name: "Choir" });
    fireEvent.change(select, { target: { value: "c1" } });
    fireEvent.change(screen.getByLabelText(/Sub-category name/), {
      target: { value: "Soprano" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add sub-category" }));

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.categories("orgA"),
      })
    );
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: queryKeys.categories("orgB"),
    });
  });
});

describe("after a save", () => {
  it("clears the category name so a second tap can't add it twice", async () => {
    setOrg("orgA");
    renderPage(<Category />);
    const input = screen.getByLabelText(/Category name/i);
    fireEvent.change(input, { target: { value: "Ushers" } });
    fireEvent.click(screen.getByRole("button", { name: "Add category" }));
    await waitFor(() => expect(input).toHaveValue(""));
    expect(postSpy).toHaveBeenCalledWith("/organisations/orgA/category", { name: "Ushers" });
  });

  it("keeps the chosen category but clears the sub-category name", async () => {
    setOrg("orgA");
    renderPage(<SubCategory />);
    const select = await screen.findByRole("combobox");
    await screen.findByRole("option", { name: "Choir" });
    fireEvent.change(select, { target: { value: "c1" } });
    const name = screen.getByLabelText(/Sub-category name/);
    fireEvent.change(name, { target: { value: "Alto" } });
    fireEvent.click(screen.getByRole("button", { name: "Add sub-category" }));
    await waitFor(() => expect(name).toHaveValue(""));
    expect(select).toHaveValue("c1");
  });
});

describe("existing categories", () => {
  it("lists what already exists under the form", async () => {
    getSpy.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data:
            url === "/organisations/orgA/category"
              ? [{ id: "c1", name: "Choir", status: "active", subCategories: [{ id: "s1", name: "Soprano", status: "active", parentCategoryId: "c1" }] }]
              : [],
        },
      })
    );
    setOrg("orgA");
    renderPage(<Category />);
    expect(await screen.findByText("Existing categories")).toBeInTheDocument();
    expect(await screen.findByText("Choir")).toBeInTheDocument();
    expect(screen.getByText("Soprano")).toBeInTheDocument();
  });

  it("asks for a category first when there are none", async () => {
    getSpy.mockImplementation(() => Promise.resolve({ data: { data: [] } }));
    setOrg("orgA");
    renderPage(<SubCategory />);
    expect(await screen.findByText("Add category first")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
