import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import theme from "styles/theme";
import StreakCard from "components/analytics/StreakCard";

it("shows the streak, rate, and the next-milestone cheer", () => {
  render(
    <ChakraProvider theme={theme}>
      <StreakCard currentStreak={5} longestStreak={12} attendanceRate={85} />
    </ChakraProvider>,
  );
  expect(screen.getByText("🔥 5")).toBeInTheDocument();
  expect(screen.getByText("85%")).toBeInTheDocument();
  expect(screen.getByText(/beat your record of 12/)).toBeInTheDocument();
  expect(screen.getByText("🏅 10")).toBeInTheDocument();
});
