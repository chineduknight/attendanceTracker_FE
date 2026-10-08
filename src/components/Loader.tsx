import { Spinner, Center } from "@chakra-ui/react";

type LoaderType = {
  h?: string;
};
const Loader = (props: LoaderType) => {
  const { h = "100vh" } = props;
  return (
    <Center h={h} w="100%">
      <Spinner
        borderWidth="4px"
        animationDuration="0.65s"
        css={{ "--spinner-track-color": "colors.gray.200" }}
        color="black"
        size="xl"
      />
    </Center>
  );
};

export default Loader;
