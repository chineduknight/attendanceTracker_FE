// https://github.com/chakra-ui/chakra-ui/blob/main/packages/theme/components/input.ts
export const ButtonStyles = {
  // style object for base or default style
  baseStyle: {
    color: "#fff", // ensure text color is white
    outline: "none",
    _focus: { boxShadow: "none" },
  },
  // styles for different sizes ("sm", "md", "lg")
  sizes: {},
  // styles for different visual variants ("outline", "solid")
  variants: {
    primary: (props) => ({
      bg: "#3f51b5", // indigo shade
      borderRadius: "4px",
      fontSize: "14px",
      fontWeight: "500",
      _hover: {
        bg: "#283593", // darker shade of indigo for hover
        boxShadow: "md",
        _disabled: {
          bg: "#283593",
        },
      },
    }),
    secondary: () => ({
      bg: "#EEEEEE",
      borderRadius: "4px",
      fontSize: "14px",
      fontWeight: "500",
      _hover: {
        bg: "#E5EBF5",
        boxShadow: "md",
        outline: "none",
      },
    }),
    danger: () => ({
      bg: "#b71c1c", // deep red color
      borderRadius: "4px",
      fontSize: "14px",
      fontWeight: "500",
      _hover: {
        bg: "#d32f2f", // brighter red on hover
        boxShadow: "md",
      },
    }),
    logout: () => ({
      bg: "#9e9e9e", // a lighter neutral gray color for better contrast with the blue navbar
      borderRadius: "4px",
      fontSize: "14px",
      fontWeight: "500",
      _hover: {
        bg: "#757575", // a slightly darker gray on hover
        boxShadow: "md",
      },
    }),
  },
  // default values for `size` and `variant`
  defaultProps: {
    variant: "primary",
  },
};
