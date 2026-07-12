import { openExportUrl } from "components/analytics/analyticsExport";

describe("openExportUrl", () => {
  const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);
  afterEach(() => openSpy.mockClear());

  it("opens the trimmed url from response.data in a new tab", () => {
    openExportUrl({ data: "  https://files.example/x.xlsx  " }, "Excel");
    expect(openSpy).toHaveBeenCalledWith(
      "https://files.example/x.xlsx",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("does not open a tab when there is no url string", () => {
    openExportUrl({ data: 123 }, "PDF");
    expect(openSpy).not.toHaveBeenCalled();
  });
});
