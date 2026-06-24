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
import { FaArrowCircleLeft, FaFileExcel, FaShareAlt, FaTrash } from "react-icons/fa";
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

  const handleSendToWhatsapp = () => {
    // Group present members by their part
    const presentMembersByPart = allMembers
      .filter(
        (item) =>
          item.attendanceStatus === "present" ||
          item.attendanceStatus === "apology",
      )
      .reduce((acc, item) => {
        // Use "others" if member.part is missing.
        const part = item.member.part
          ? item.member.part.toLowerCase()
          : "others";
        if (!acc[part]) {
          acc[part] = [];
        }
        // Add prefix based on gender
        const prefix =
          item.member.gender && item.member.gender.toLowerCase() === "male"
            ? "Bro "
            : "Sis ";
        const nameWithPrefix =
          prefix +
          item.member.name +
          (item.attendanceStatus === "apology" ? " (Apology)" : "");
        acc[part].push(nameWithPrefix);
        return acc;
      }, {});

    // Define the desired order for known choir parts.
    const orderedParts = ["soprano", "alto", "tenor", "bass"];
    let presentMembersString = "";

    // Process the known parts first.
    orderedParts.forEach((part) => {
      if (presentMembersByPart[part] && presentMembersByPart[part].length > 0) {
        // Sort alphabetically ignoring the prefix.
        presentMembersByPart[part].sort((a, b) => {
          const nameA = a.replace(/^(Bro |Sis )/, "").toLowerCase();
          const nameB = b.replace(/^(Bro |Sis )/, "").toLowerCase();
          return nameA.localeCompare(nameB);
        });
        presentMembersString +=
          `*${capitalize(part)}*\n` +
          presentMembersByPart[part].join("\n") +
          "\n\n";
      }
    });

    // Process any extra parts (including "others") that are not in the orderedParts array.
    const extraParts = Object.keys(presentMembersByPart).filter(
      (part) => !orderedParts.includes(part),
    );
    extraParts.sort().forEach((part) => {
      if (presentMembersByPart[part] && presentMembersByPart[part].length > 0) {
        presentMembersByPart[part].sort((a, b) => {
          const nameA = a.replace(/^(Bro |Sis )/, "").toLowerCase();
          const nameB = b.replace(/^(Bro |Sis )/, "").toLowerCase();
          return nameA.localeCompare(nameB);
        });
        presentMembersString +=
          `*${capitalize(part)}*\n` +
          presentMembersByPart[part].join("\n") +
          "\n\n";
      }
    });

    // Absent members: Only display the count.
    const allAbsentMembers = allMembers.filter(
      (item) => item.attendanceStatus === "absent",
    );
    console.log("allAbsentMembers:", allAbsentMembers);
    const absentCount = allAbsentMembers.filter(
      (item) => item.member.status === "active",
    ).length;
    const absentMembersString = `*Absent Members:(${absentCount})*`;

    const presentCount = allMembers.filter(
      (item) => item.attendanceStatus === "present",
    ).length;
    const apologyCount = allMembers.filter(
      (item) => item.attendanceStatus === "apology",
    ).length;
    const title = `Attendance Info\n\n${attendanceInfo?.name}\nDate: ${formattedDate}\nPresent (${presentCount})\nApology (${apologyCount})\n`;
    const message = [title, presentMembersString, absentMembersString]
      .filter(Boolean)
      .join("\n");

    console.log("message:", message);
    const phoneNumber = "+2348032374369"; // replace with the actual phone number
    const whatsappLink = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(
      message,
    )}`;

    if (navigator.share) {
      navigator
        .share({
          title: "Attendance Information",
          text: message,
        })
        .then(() => console.log("Successful share"))
        .catch((error) => console.log("Error sharing", error));
    } else {
      window.open(whatsappLink);
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
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text fontWeight="bold" color="#fff">
          View Attendance
        </Text>
      </Flex>
      <Container>
        {isLoadingAttendance ? (
          <LoadingSpinner h="40vh" text="Loading attendance..." />
        ) : (
          <>
            <Flex mt="4" justifyContent="space-between">
              <Button
                variant="logout"
                colorScheme="blue"
                onClick={() => navigate(-1)}
                leftIcon={<FaArrowCircleLeft />}
              >
                Back
              </Button>
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
