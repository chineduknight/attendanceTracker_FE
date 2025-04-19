import React, { useState, useMemo } from "react";
import {
  Box,
  Flex,
  Input,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Spinner,
  useColorModeValue,
  Text,
} from "@chakra-ui/react";
import { useQueryWrapper } from "services/api/apiHelper";
import useGlobalStore from "zStore";
import { useNavigate } from "react-router-dom";
import { FaArrowCircleLeft } from "react-icons/fa";
import { PROTECTED_PATHS } from "routes/pagePath";

const AttendanceAnalyticsPage: React.FC = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const navigate = useNavigate();

  // build the request URL once both dates are set
  const url = useMemo(() => {
    if (!fromDate || !toDate) return null;
    return `/attendance/${org.id}/analytics?fromDate=${fromDate}&toDate=${toDate}`;
  }, [fromDate, toDate, org.id]);

  // react‑query wrapper: don't run until we call refetch()
  const {
    data: analyticsResponse,
    isLoading,
    error,
    refetch,
  } = useQueryWrapper(
    ["attendanceAnalytics", fromDate, toDate],
    url || "", // Provide an empty string as a fallback
    {
      enabled: false,
    }
  );

  const handleSearch = () => {
    if (fromDate && toDate) {
      refetch();
    }
  };

  // pull out keys & data rows
  const keys: string[] = useMemo(
    () => analyticsResponse?.data.keys || [],
    [analyticsResponse?.data.keys]
  );
  const rows: any[] = analyticsResponse?.data.analytics || [];

  // detect which columns are dates
  const dateKeys = useMemo(
    () => keys.filter((k) => /\d{4}-\d{2}-\d{2}$/.test(k)),
    [keys]
  );

  // static totals
  // static totals (simplified labels) and a lookup for your actual field keys
  const totalKeys = ["Present", "Absent", "Apology"];
  const totalsMap: Record<string, string> = {
    Present: "Total Number of Times Present",
    Absent: "Total Number of Times Absent",
    Apology: "Total Number of  Apology",
  };

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text fontWeight="bold" color="#fff">
          Attendance Analytics
        </Text>
      </Flex>
      <Box p={6}>
        <>
          <Button
            variant="logout"
            colorScheme="blue"
            onClick={() => navigate(PROTECTED_PATHS.DASHBOARD)}
            mr={2}
            leftIcon={<FaArrowCircleLeft />}
            m="2"
          >
            Back
          </Button>
          {/* Date selectors + button */}
          <Flex mb={6} gap={2} align="center">
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              max={toDate || undefined}
            />
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              min={fromDate || undefined}
            />
            <Button colorScheme="blue" onClick={handleSearch}>
              Search
            </Button>
          </Flex>

          {/* Loading & error */}
          {isLoading && <Spinner />}
          {error && (
            <Text color="red.500" mb={4}>
              Error fetching analytics.
            </Text>
          )}

          {/* Table */}
          {!isLoading && !error && rows.length > 0 && (
            <Box overflowX="auto">
              <Table variant="striped" size="sm">
                <Thead>
                  <Tr>
                    <Th>Name</Th>
                    {totalKeys.map((label) => (
                      <Th key={label} isNumeric>
                        {label}
                      </Th>
                    ))}
                    {dateKeys.map((d) => (
                      <Th key={d}>{d.split(" On ")[1]}</Th>
                    ))}
                  </Tr>
                </Thead>
                <Tbody>
                  {rows.map((row) => (
                    <Tr key={row.memberId}>
                      <Td>{row.name}</Td>

                      {totalKeys.map((label) => (
                        <Td key={label} isNumeric>
                          {row[totalsMap[label]]}
                        </Td>
                      ))}

                      {dateKeys.map((d) => {
                        const status = row[d] as string as
                          | "present"
                          | "absent"
                          | "apology"
                          | undefined;
                        let color: string, label: string;
                        switch (status) {
                          case "present":
                            color = "green";
                            label = "P";
                            break;
                          case "absent":
                            color = "red";
                            label = "A";
                            break;
                          case "apology":
                            color = "yellow";
                            label = "AP";
                            break;
                          default:
                            color = "gray";
                            label = "-";
                        }
                        return (
                          <Td key={d} textAlign="center">
                            <Badge colorScheme={color}>{label}</Badge>
                          </Td>
                        );
                      })}
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          )}

          {/* No data message */}
          {!isLoading && !error && rows.length === 0 && (
            <Text>No attendance records found for this range.</Text>
          )}
        </>
      </Box>
    </Box>
  );
};

export default AttendanceAnalyticsPage;
