import React, { useMemo } from "react";
import { Box, Flex, Button, Spinner, Text } from "@chakra-ui/react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { FaArrowCircleLeft, FaFileExcel, FaFilePdf } from "react-icons/fa";
import { useQueryWrapper } from "services/api/apiHelper";
import { attendanceRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import useGlobalStore from "zStore";
import { PROTECTED_PATHS } from "routes/pagePath";
import { useDateRange } from "components/analytics/useDateRange";
import DateRangeControls from "components/analytics/DateRangeControls";
import MemberHero from "components/analytics/MemberHero";
import StreakCard from "components/analytics/StreakCard";
import StatTiles from "components/analytics/StatTiles";
import AttendanceTimeline from "components/analytics/AttendanceTimeline";
import MemberRecordsTable from "components/analytics/MemberRecordsTable";
import { openExportUrl, handleExportError } from "components/analytics/analyticsExport";
import { MemberAnalytics as MemberAnalyticsData } from "components/analytics/memberAnalyticsTypes";

const buildQuery = (fromDate: string, toDate: string) => {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  return params.toString();
};

const withQuery = (path: string, queryString: string) =>
  queryString ? `${path}?${queryString}` : path;

const MemberAnalyticsPage: React.FC = () => {
  const { memberId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [org] = useGlobalStore((state) => [state.organisation]);
  const navigate = useNavigate();

  const {
    fromDate, toDate, setFromDate, setToDate,
    activePreset, applyPreset, handleDateChange,
  } = useDateRange({
    initialFrom: searchParams.get("fromDate") ?? "",
    initialTo: searchParams.get("toDate") ?? "",
  });

  const canQuery = Boolean(org.id && memberId);
  const queryString = useMemo(() => buildQuery(fromDate, toDate), [fromDate, toDate]);

  const url = useMemo(() => {
    if (!canQuery) return "";
    const path = convertParamsToString(attendanceRequest.MEMBER_ANALYTICS, {
      organisationId: org.id,
      memberId,
    });
    return withQuery(path, queryString);
  }, [canQuery, org.id, memberId, queryString]);

  const { data: response, isFetching, error } = useQueryWrapper(
    ["memberAnalytics", org.id, memberId, fromDate, toDate],
    url,
    { enabled: canQuery },
  );

  const analytics: MemberAnalyticsData | undefined = response?.data;
  const statusCode = (error as any)?.response?.status;
  const hasData = Boolean(analytics && analytics.summary.totalSessions > 0);

  const excelUrl = useMemo(() => {
    if (!canQuery) return "";
    const path = convertParamsToString(attendanceRequest.MEMBER_ANALYTICS_EXPORT_EXCEL, {
      organisationId: org.id, memberId,
    });
    return withQuery(path, queryString);
  }, [canQuery, org.id, memberId, queryString]);

  const pdfUrl = useMemo(() => {
    if (!canQuery) return "";
    const path = convertParamsToString(attendanceRequest.MEMBER_ANALYTICS_EXPORT_PDF, {
      organisationId: org.id, memberId,
    });
    return withQuery(path, queryString);
  }, [canQuery, org.id, memberId, queryString]);

  const { refetch: refetchExcel, isFetching: isExportingExcel } = useQueryWrapper(
    ["memberAnalyticsExcel", org.id, memberId, fromDate, toDate],
    excelUrl,
    {
      enabled: false,
      onSuccess: (res: any) => openExportUrl(res, "Excel"),
      onError: (err: any) => handleExportError(err, "Excel"),
    },
  );

  const { refetch: refetchPdf, isFetching: isExportingPdf } = useQueryWrapper(
    ["memberAnalyticsPdf", org.id, memberId, fromDate, toDate],
    pdfUrl,
    {
      enabled: false,
      onSuccess: (res: any) => openExportUrl(res, "PDF"),
      onError: (err: any) => handleExportError(err, "PDF"),
    },
  );

  return (
    <Box minH="100vh" bg="gray.50">
      <Flex bg="blue.500" justify="space-between" align="center" p="4">
        <Text fontWeight="bold" color="#fff">Member Analytics</Text>
      </Flex>
      <Box p={2}>
        <>
        <Flex justify="space-between" align="center" flexWrap="wrap" gap={2} mb={3}>
          <Button
            variant="logout" colorScheme="blue" leftIcon={<FaArrowCircleLeft />}
            onClick={() => navigate(PROTECTED_PATHS.ANALYTICS)}
          >
            Back
          </Button>
          <Flex gap={2} flexWrap="wrap">
            <Button
              leftIcon={<FaFileExcel />} onClick={() => refetchExcel()}
              isLoading={isExportingExcel} isDisabled={!hasData}
              bg="green.500" color="white" _hover={{ bg: "green.600" }}
            >
              Export Excel
            </Button>
            <Button
              leftIcon={<FaFilePdf />} onClick={() => refetchPdf()}
              isLoading={isExportingPdf} isDisabled={!hasData}
              bg="red.500" color="white" _hover={{ bg: "red.600" }}
            >
              Export PDF
            </Button>
          </Flex>
        </Flex>

        <DateRangeControls
          fromDate={fromDate}
          toDate={toDate}
          activePreset={activePreset}
          applyPreset={applyPreset}
          setFromDate={setFromDate}
          setToDate={setToDate}
          handleDateChange={handleDateChange}
        />

        {isFetching && <Spinner />}
        {!isFetching && statusCode === 404 && (
          <Text color="red.500" mt={4}>Member not found in this organisation.</Text>
        )}
        {!isFetching && error && statusCode !== 404 && (
          <Text color="red.500" mt={4}>Error loading member analytics.</Text>
        )}
        {!isFetching && !error && analytics && !hasData && (
          <Text mt={4}>No attendance records for this range.</Text>
        )}
        {!isFetching && !error && hasData && analytics && (
          <Flex direction="column" gap={4} mt={2}>
            <MemberHero name={analytics.member.name} fields={analytics.member.fields} />
            <StreakCard
              currentStreak={analytics.summary.currentStreak}
              longestStreak={analytics.summary.longestStreak}
              attendanceRate={analytics.summary.attendanceRate}
            />
            <StatTiles
              present={analytics.summary.present}
              absent={analytics.summary.absent}
              apology={analytics.summary.apology}
              totalSessions={analytics.summary.totalSessions}
            />
            <AttendanceTimeline verdicts={analytics.verdicts} />
            <MemberRecordsTable records={analytics.records} />
          </Flex>
        )}
        </>
      </Box>
    </Box>
  );
};

export default MemberAnalyticsPage;
