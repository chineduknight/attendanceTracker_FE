import {
    Box,
    Flex,
    useColorModeValue,
    Button,
    Text,
    Stack,
    Image,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import {
    queryClient,
    useMutationWrapper,
    useQueryWrapper,
} from "services/api/apiHelper";
import { useState } from "react";
import { orgRequest } from 'services';
import useGlobalStore from 'zStore';

type AttendType = {
    name: string;
    image: string;
    owner: string;
    createdAt: string;
    updatedAt: string;
    id: string;
};

const ViewAttendance = () => {
    const onSuccess = () => {
        refetch();
        queryClient.invalidateQueries({ queryKey: ["all-Attendance"] });
    };
    const { mutate } = useMutationWrapper(onSuccess);
    const [allAttend, setAllAttend] = useState<AttendType[]>([]);
    const handleGetAllattendSuccess = (data) => {
        setAllAttend(data.data);
    };
    const { refetch } = useQueryWrapper(["all-attendanisations"], orgRequest.ALL_ATTENDANCE, {
        onSuccess: handleGetAllattendSuccess,
    });

    return (
        <div>ViewAttendance</div>
    )
}

export default ViewAttendance