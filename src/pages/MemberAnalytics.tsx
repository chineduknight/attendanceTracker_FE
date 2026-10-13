import React, { useMemo } from "react";
import { Flex } from "@chakra-ui/react";
import { useParams, useSearchParams } from "react-router-dom";
import { FiBarChart2, FiUserX } from "react-icons/fi";
import { useQueryWrapper } from "services/api/apiHelper";
import { attendanceRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import useGlobalStore from "zStore";
import { useDateRange } from "components/analytics/useDateRange";
import DateRangeControls from "components/analytics/DateRangeControls";
import MemberHero from "components/analytics/MemberHero";
import StreakCard from "components/analytics/StreakCard";
import StatTiles from "components/analytics/StatTiles";
import AttendanceTimeline from "components/analytics/AttendanceTimeline";
import MemberRecordsList from "components/analytics/MemberRecordsList";
import ExportMenu from "components/analytics/ExportMenu";
import PageContainer from "components/layout/PageContainer";
import PageLoader from "components/PageLoader";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { openExportUrl, handleExportError } from "components/analytics/analyticsExport";
import { MemberAnalytics as MemberAnalyticsData } from "components/analytics/memberAnalyticsTypes";
import { useAttendanceStatuses } from "hooks/useAttendanceStatuses";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";
import { queryKeys } from "services/api/queryKeys";

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
  const terms = useTerms();

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

  const { data: response, isFetching, error, refetch } = useQueryWrapper(
    queryKeys.analytics.member(org.id, memberId, fromDate, toDate),
    url,
    { enabled: canQuery },
  );

  const analytics: MemberAnalyticsData | undefined = response?.data;
  const statuses = useAttendanceStatuses(analytics?.attendanceStatuses);
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
    <PageContainer width="content">
      <Flex justify="flex-end" mb={3}>
        <ExportMenu
          onExcel={() => refetchExcel()}
          onPdf={() => refetchPdf()}
          disabled={!hasData}
          busy={isExportingExcel || isExportingPdf}
        />
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

      {isFetching && <PageLoader h="30vh" />}
      {!isFetching && statusCode === 404 && (
        <EmptyState
          icon={<FiUserX />}
          title={`${terms.memberSingular} not found in this organisation.`}
        />
      )}
      {!isFetching && Boolean(error) && statusCode !== 404 && (
        <ErrorState
          title={`Error loading ${lowerTerm(terms.memberSingular)} analytics.`}
          description={errorMessage(error)}
          onRetry={() => refetch()}
        />
      )}
      {!isFetching && !error && analytics && !hasData && (
        <EmptyState
          icon={<FiBarChart2 />}
          title={`No included ${lowerTerm(terms.attendanceSingular)} records for this range.`}
        />
      )}
      {!isFetching && !error && hasData && analytics && (
        <Flex direction="column" gap={4}>
          <MemberHero name={analytics.member.name} fields={analytics.member.fields} />
          <StreakCard
            currentStreak={analytics.summary.currentStreak}
            longestStreak={analytics.summary.longestStreak}
            attendanceRate={analytics.summary.attendanceRate}
          />
          <StatTiles
            behaviorCounts={analytics.summary.behaviorCounts}
            totalSessions={analytics.summary.totalSessions}
          />
          <AttendanceTimeline verdicts={analytics.verdicts} statuses={statuses} />
          <MemberRecordsList records={analytics.records} statuses={statuses} />
        </Flex>
      )}
    </PageContainer>
  );
};

export default MemberAnalyticsPage;
