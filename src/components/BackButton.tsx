import { Button } from "@chakra-ui/react";
import { FaArrowCircleLeft } from "react-icons/fa";

type BackButtonType = {
  handleClick: () => void;
};

const BackButton = (props: BackButtonType) => {
  const { handleClick } = props;
  return (
    <Button
      onClick={handleClick}
      variant="logout"
      mt="10px"
      ml="10px"
      color={"white"}
      _hover={{
        bg: "blue.500",
      }}
      leftIcon={<FaArrowCircleLeft />}
    >
      Back
    </Button>
  );
};

export default BackButton;
