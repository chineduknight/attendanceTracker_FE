import {
  Box,
  Flex,
  useColorModeValue,
  Text,
  Button,
  Input,
  Heading,
  InputGroup,
  InputLeftElement,
  Container,
} from "@chakra-ui/react";
import { capitalize, convertParamsToString } from "helpers/stringManipulations";
import { useState, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { confirmAlert } from "react-confirm-alert";
import { PROTECTED_PATHS } from "routes/pagePath";
import { attendanceRequest } from "services";
import { deleteRequest, queryClient, useMutationWrapper, useQueryWrapper } from "services/api/apiHelper";
import useGlobalStore from "zStore";
import { format } from "date-fns";
import { Q_KEY } from "utils/constant";
import LoadingSpinner from "components/LoadingSpinner";
import { FaFileExcel, FaShareAlt, FaTrash } from "react-icons/fa";
import { toast } from "react-toastify";
import ReactSelect, { MultiValue } from "react-select";

type StatusOption = {
  value: string;
  label: string;
};

type MemberType = {
  attendanceStatus: "absent" | "present" | "apology";
  memberId: string;
  _id: string;
  member: {
    name: string;
    status: string;
    gender?: string;
    part?: string;
  };
};

type AttendanceInfoType = {
  name: string;
  date: Date;
  present: number;
  apology: number;
  absent: number;
};

// Voice parts are always listed in this order; anything else is appended after.
const VOICE_PART_ORDER = ["soprano", "alto", "tenor", "bass"];

const partKeyOf = (item: MemberType): string =>
  item.member.part ? item.member.part.toLowerCase() : "others";

const partLabelOf = (partKey: string): string =>
  partKey === "others" ? "Other" : capitalize(partKey);

// Rank used to sort a mixed list (e.g. apologies) by voice part; unknown parts last.
const partRankOf = (item: MemberType): number => {
  const index = VOICE_PART_ORDER.indexOf(partKeyOf(item));
  return index === -1 ? VOICE_PART_ORDER.length : index;
};

const memberDisplayName = (item: MemberType): string => {
  const isMale = item.member.gender?.toLowerCase() === "male";
  return `${isMale ? "Bro" : "Sis"} ${item.member.name}`;
};

const byMemberName = (a: MemberType, b: MemberType): number =>
  a.member.name.toLowerCase().localeCompare(b.member.name.toLowerCase());

const orderedPartKeys = (keys: string[]): string[] => {
  const known = VOICE_PART_ORDER.filter((part) => keys.includes(part));
  const extra = keys.filter((part) => !VOICE_PART_ORDER.includes(part)).sort();
  return [...known, ...extra];
};

// Closing paragraph pools, grouped by tone. One is chosen based on the session
// figures so the message feels human without repeating the same line every time.
const CLOSING_MESSAGES: Record<string, string[]> = {
  strong: [
    "Great music is built long before the performance, one rehearsal and one committed member at a time. Thank you for contributing your part.",
    "Each time we gather, we become stronger as one choir. Thank you for showing up and helping us move the music forward.",
  ],
  apologies: [
    "Thank you to everyone who was present and to those who communicated responsibly. Let us keep growing in consistency and readiness.",
  ],
  low: [
    "Our strength depends on every voice taking its place. Let us make a renewed effort to be present and prepared at the next gathering.",
  ],
  general: [
    "Thank you to everyone who attended or communicated their absence. Let us continue to build a choir marked by commitment, consistency, and love for the music.",
    "Every rehearsal strengthens the sound we create together. Thank you for showing up, and let us return even stronger at the next gathering.",
    "Your presence matters, your voice matters, and your commitment strengthens the entire choir. Thank you for being part of the work.",
  ],
};

const pickClosingMessage = (
  present: number,
  apology: number,
  absent: number,
): string => {
  const total = present + apology + absent;
  const presentRate = total > 0 ? present / total : 0;

  let tone: keyof typeof CLOSING_MESSAGES = "general";
  if (total > 0 && presentRate < 0.4) tone = "low";
  else if (presentRate >= 0.7) tone = "strong";
  else if (apology > 0 && apology / total >= 0.2) tone = "apologies";

  const pool = CLOSING_MESSAGES[tone];
  return pool[Math.floor(Math.random() * pool.length)];
};

const Attendance = () => {
  const [allMembers, setAllMembers] = useState<MemberType[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>(["all"]);
  const [org] = useGlobalStore((state) => [state.organisation]);
  const [attendanceInfo, setAttendanceInfo] = useState<AttendanceInfoType>();
  const navigate = useNavigate();
  const onSuccess = (data) => {
    const unsorted = data.data.attendance.filter((a) => a.member != null);
    const statusOrder = { present: 0, apology: 1, absent: 2 };
    const members = unsorted.sort((a, b) => {
      return (
        statusOrder[a.attendanceStatus] - statusOrder[b.attendanceStatus] ||
        a.member.name.localeCompare(b.member.name)
      );
    });

    const presentCount = members.filter(
      (member) => member.attendanceStatus === "present",
    ).length;
    const apologyCount = members.filter(
      (member) => member.attendanceStatus === "apology",
    ).length;
    const absentCount = members.filter(
      (member) => member.attendanceStatus === "absent",
    ).length;

    setAttendanceInfo({
      ...data.data,
      present: presentCount,
      apology: apologyCount,
      absent: absentCount,
    });

    setAllMembers(members);
  };
  const param = useParams();
  const url = convertParamsToString(attendanceRequest.GET_ATTENDANCE, {
    organisationId: org.id,
    id: param.id as string,
  });

  const { isFetching: isFetchingAttendance } = useQueryWrapper(
    [Q_KEY.GET_MEMBERS],
    url,
    {
      onSuccess,
      refetchOnWindowFocus: false,
    },
  );
  const isLoadingAttendance = isFetchingAttendance && allMembers.length === 0;

  const handleSearch = useCallback((e) => setSearchQuery(e.target.value), []);

  const statusOptions = useMemo<StatusOption[]>(() => {
    const unique = Array.from(
      new Set(allMembers.map((m) => m.member.status).filter(Boolean)),
    );
    return [
      { value: "all", label: "All" },
      ...unique.map((s) => ({ value: s, label: capitalize(s) })),
    ];
  }, [allMembers]);

  const selectedStatusOptions = useMemo(
    () => statusOptions.filter((o) => statusFilter.includes(o.value)),
    [statusOptions, statusFilter],
  );

  const filteredMembers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return allMembers.filter((m) => {
      const matchesName = m.member.name.toLowerCase().includes(query);
      const matchesStatus =
        statusFilter.includes("all") ||
        statusFilter.length === 0 ||
        statusFilter.includes(m.member.status);
      return matchesName && matchesStatus;
    });
  }, [allMembers, searchQuery, statusFilter]);

  const formattedDate = attendanceInfo?.date
    ? format(new Date(attendanceInfo.date), "EEE dd MMM yy")
    : "";

  const buildWhatsappMessage = (): string => {
    const presentMembers = allMembers.filter(
      (item) => item.attendanceStatus === "present",
    );
    const apologyMembers = allMembers.filter(
      (item) => item.attendanceStatus === "apology",
    );
    const presentCount = presentMembers.length;
    const apologyCount = apologyMembers.length;
    // Absent count only reflects active members, matching the on-screen figures.
    const absentCount = allMembers.filter(
      (item) =>
        item.attendanceStatus === "absent" && item.member.status === "active",
    ).length;

    // Header: choir name, session name, date, and a compact present/apology summary.
    const orgTitle = (org.name || "Choir").toUpperCase();
    const headerBlock = `🎶 *${orgTitle} ATTENDANCE*`;
    const sessionBlock = [
      `*${attendanceInfo?.name ?? ""}*`,
      `📅 ${formattedDate}`,
    ].join("\n");
    const summaryBlock = `✅ Present: ${presentCount}  |  🟡 Apology: ${apologyCount}`;

    // Present members grouped by voice part, each heading carrying its own count.
    const presentByPart = presentMembers.reduce(
      (acc: Record<string, MemberType[]>, item) => {
        const partKey = partKeyOf(item);
        if (!acc[partKey]) acc[partKey] = [];
        acc[partKey].push(item);
        return acc;
      },
      {},
    );
    const partKeys = orderedPartKeys(Object.keys(presentByPart));
    const presentBody = partKeys.length
      ? partKeys
          .map((partKey) => {
            const group = [...presentByPart[partKey]].sort(byMemberName);
            return [
              `*${partLabelOf(partKey)} — ${group.length}*`,
              ...group.map(memberDisplayName),
            ].join("\n");
          })
          .join("\n\n")
      : "No members recorded as present.";
    const presentSection = `*PRESENT MEMBERS*\n\n${presentBody}`;

    // Apologies: one combined list ordered by part, with the part beside each name.
    const apologySection = apologyCount
      ? [
          `*APOLOGIES — ${apologyCount}*`,
          ...[...apologyMembers]
            .sort((a, b) => partRankOf(a) - partRankOf(b) || byMemberName(a, b))
            .map(
              (item) =>
                `${memberDisplayName(item)} — ${partLabelOf(partKeyOf(item))}`,
            ),
        ].join("\n")
      : "";

    const absentSection = `🔴 *Absent Members: ${absentCount}*`;
    const closingSection = `_${pickClosingMessage(
      presentCount,
      apologyCount,
      absentCount,
    )}_`;

    return [
      headerBlock,
      sessionBlock,
      summaryBlock,
      presentSection,
      apologySection,
      absentSection,
      closingSection,
    ]
      .filter(Boolean)
      .join("\n\n");
  };

  const handleSendToWhatsapp = () => {
    const message = buildWhatsappMessage();
    if (navigator.share) {
      navigator
        .share({ title: "Attendance Information", text: message })
        .catch(() => {
          /* user dismissed the native share sheet */
        });
    } else {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer",
      );
    }
  };

  const downloadURl = useMemo(() => {
    const base = convertParamsToString(attendanceRequest.EXPORT, {
      organisationId: org.id,
      id: param.id as string,
    });
    const activeStatuses = statusFilter.filter((s) => s !== "all");
    return activeStatuses.length > 0
      ? `${base}?status=${activeStatuses.join(",")}`
      : base;
  }, [org.id, param.id, statusFilter]);

  const { refetch, isFetching } = useQueryWrapper(
    ["export-excel", org.id, param.id, statusFilter.join(",")],
    downloadURl,
    {
      enabled: false,
      refetchOnWindowFocus: false,
      onSuccess: (data) => {
        window.open(data.data);
      },
      onError: (error: any) => {
        const message =
          error?.response?.data?.error ?? "Failed to export. Please try again.";
        toast.error(message);
      },
    },
  );

  const sendToExcel = () => {
    refetch();
  };

  const deleteUrl = convertParamsToString(attendanceRequest.DELETE_ATTENDANCE, {
    organisationId: org.id,
    id: param.id as string,
  });

  const { mutate: deleteAttendance, isLoading: isDeleting } = useMutationWrapper(
    deleteRequest,
    () => {
      queryClient.invalidateQueries({ queryKey: ["all-attendance-12"] });
      navigate(PROTECTED_PATHS.ALL_ATTENDANCE);
    },
    (error: any) => {
      const message = error?.response?.data?.error ?? "Failed to delete attendance.";
      toast.error(message);
    },
  );

  const handleDelete = () => {
    confirmAlert({
      title: "Delete Attendance",
      message: "Are you sure you want to delete this attendance record? This cannot be undone.",
      buttons: [
        {
          label: "Yes",
          className: "confirm-alert-button confirm-alert-button-yes",
          onClick: () => deleteAttendance({ url: deleteUrl }),
        },
        {
          label: "No",
          className: "confirm-alert-button confirm-alert-button-no",
        },
      ],
    });
  };
  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Container>
        {isLoadingAttendance ? (
          <LoadingSpinner h="40vh" text="Loading attendance..." />
        ) : (
          <>
            <Flex mt="4" justifyContent="flex-end">
              <Flex gap={2}>
                <Button
                  onClick={handleSendToWhatsapp}
                  leftIcon={<FaShareAlt />}
                >
                  Share
                </Button>
                <Button
                  onClick={sendToExcel}
                  isLoading={isFetching}
                  leftIcon={<FaFileExcel />}
                  bg="green.500"
                  color="white"
                  _hover={{ bg: "green.600" }}
                >
                  Export to Excel
                </Button>
              </Flex>
            </Flex>

            <Flex mt="4" alignItems="center" justifyContent="space-between">
              <Heading fontSize="22px">{attendanceInfo?.name}</Heading>
              <Text>{formattedDate}</Text>
            </Flex>
            <Flex mt="4" gap={2} direction={{ base: "column", sm: "row" }}>
              <InputGroup>
                <InputLeftElement pointerEvents="none" />
                <Input
                  type="search"
                  placeholder="Search member"
                  onChange={handleSearch}
                />
              </InputGroup>
              <Box minW={{ base: "100%", sm: "200px" }}>
                <ReactSelect
                  isMulti
                  placeholder="Filter by status"
                  options={statusOptions}
                  value={selectedStatusOptions}
                  closeMenuOnSelect={false}
                  menuPortalTarget={document.body}
                  menuPosition="fixed"
                  styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
                  onChange={(selected: MultiValue<StatusOption>) => {
                    const values = selected.map((o) => o.value);
                    if (values.length === 0) {
                      setStatusFilter(["all"]);
                      return;
                    }
                    if (values.includes("all") && values.length > 1) {
                      setStatusFilter(values.filter((v) => v !== "all"));
                      return;
                    }
                    if (values.includes("all")) {
                      setStatusFilter(["all"]);
                      return;
                    }
                    setStatusFilter(values);
                  }}
                />
              </Box>
            </Flex>
            {filteredMembers.length === 0 && (
              <Box mt="4">
                <Text ml="4" fontWeight="bold">
                  No member found
                </Text>
              </Box>
            )}
            <Flex mt="2" justifyContent="space-between">
              <Text>
                Present:{" "}
                <strong>
                  {
                    filteredMembers.filter(
                      (m) => m.attendanceStatus === "present",
                    ).length
                  }{" "}
                </strong>
              </Text>
              <Text>
                Apology:{" "}
                <strong>
                  {
                    filteredMembers.filter(
                      (m) => m.attendanceStatus === "apology",
                    ).length
                  }{" "}
                </strong>
              </Text>
              <Text>
                Absent:{" "}
                <strong>
                  {
                    filteredMembers.filter(
                      (m) => m.attendanceStatus === "absent",
                    ).length
                  }{" "}
                </strong>
              </Text>
            </Flex>
            <Box mt="4" overflow="scroll" maxH="500px">
              {filteredMembers.map((item) => AttendCard(item))}
            </Box>
            <Button
              onClick={handleDelete}
              isLoading={isDeleting}
              leftIcon={<FaTrash />}
              bg="red.500"
              color="white"
              _hover={{ bg: "red.600" }}
              w="full"
              mt="4"
              mb="8"
            >
              Delete Attendance
            </Button>
          </>
        )}
      </Container>
    </Box>
  );
};

export default Attendance;
function AttendCard(item: MemberType): JSX.Element {
  const isPresent = item.attendanceStatus === "present";
  const isApology = item.attendanceStatus === "apology";
  const bg: string = isPresent ? "green" : isApology ? "orange" : "";
  const color: string = isPresent || isApology ? "#fff" : "";

  return (
    <Button
      variant="unstyled"
      display="block"
      w="full"
      mt="3"
      border="1px solid green"
      key={item.memberId}
      style={{ backgroundColor: bg, color }}
    >
      {item.member.name}
    </Button>
  ) as JSX.Element;
}
