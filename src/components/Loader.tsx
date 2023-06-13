import { Spinner, Center } from "@chakra-ui/react";

type LoaderType = {
  h?: string;
};
const Loader = (props: LoaderType) => {
  const { h = "100vh" } = props;
  return (
    <Center h={h} w="100%">
      <Spinner
        thickness="4px"
        speed="0.65s"
        emptyColor="gray.200"
        color="black"
        size="xl"
      />
    </Center>
  );
};

export default Loader;
