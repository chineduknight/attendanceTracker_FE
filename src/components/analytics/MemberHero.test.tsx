import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import theme from "styles/theme";
import MemberHero from "components/analytics/MemberHero";

it("renders the name, initials, and an identity line from primitive fields", () => {
  render(
    <ChakraProvider theme={theme}>
      <MemberHero
        name="Ada Lovelace"
        fields={{ part: "soprano", status: "active", tags: ["x"] }}
      />
    </ChakraProvider>,
  );
  expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  expect(screen.getByText("AL")).toBeInTheDocument();
  expect(screen.getByText("Soprano · Active")).toBeInTheDocument();
});
