import { OBJECT_URL_REVOKE_DELAY_MS, saveBlob } from "helpers/saveBlob";

describe("saveBlob", () => {
  const createObjectURL = jest.fn();
  const revokeObjectURL = jest.fn();
  let clicked: HTMLAnchorElement[] = [];

  beforeEach(() => {
    jest.useFakeTimers();
    clicked = [];
    // CRA resets mock implementations before each test.
    createObjectURL.mockReturnValue("blob:http://localhost/file-1");
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  it("downloads the blob under the name, then removes the link and revokes the URL", () => {
    const blob = new Blob(["bytes"], { type: "application/pdf" });
    saveBlob(blob, "Financial_Report_2026-09-01_to_2026-09-30.pdf");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe("Financial_Report_2026-09-01_to_2026-09-30.pdf");
    expect(clicked[0].href).toBe("blob:http://localhost/file-1");
    expect(document.body.querySelector("a")).toBeNull();

    expect(revokeObjectURL).not.toHaveBeenCalled();
    jest.advanceTimersByTime(OBJECT_URL_REVOKE_DELAY_MS);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/file-1");
  });

  it("still cleans up when the click throws", () => {
    (HTMLAnchorElement.prototype.click as jest.Mock).mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveBlob(new Blob(["x"]), "a.xlsx")).toThrow("blocked");
    expect(document.body.querySelector("a")).toBeNull();
    jest.advanceTimersByTime(OBJECT_URL_REVOKE_DELAY_MS);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
