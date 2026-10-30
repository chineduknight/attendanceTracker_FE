import { toast } from "react-toastify";
import { showMutationError } from "services/api/apiHelper";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const mockError = toast.error as jest.Mock;

const backendError = (error: unknown) => ({
  response: { status: 422, data: { error } },
});

describe("showMutationError", () => {
  beforeEach(() => mockError.mockClear());

  it("shows a validation list as one toast, not one per message", () => {
    showMutationError(backendError(["Name is required", "Date is required"]));

    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError).toHaveBeenCalledWith(
      "Name is required • Date is required",
      {
        autoClose: false,
        toastId: "Name is required • Date is required",
      },
    );
  });

  it("gives an identical failure a stable toast id so it does not stack", () => {
    showMutationError(backendError("Could not save"));
    showMutationError(backendError("Could not save"));

    const ids = mockError.mock.calls.map(([, options]) => options.toastId);
    expect(ids).toEqual(["Could not save", "Could not save"]);
  });

  it("falls back to a readable message", () => {
    showMutationError(new Error("offline"));

    expect(mockError).toHaveBeenCalledWith("An error occured", {
      toastId: "An error occured",
    });
  });

  it("leaves 401s to the global interceptor", () => {
    showMutationError({ response: { status: 401 } });

    expect(mockError).not.toHaveBeenCalled();
  });
});
