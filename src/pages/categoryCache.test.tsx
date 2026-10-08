import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

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
