import { forwardRef, useState } from "react";
import {
  Input, InputGroup,  IconButton, InputProps,
} from "@chakra-ui/react";
import { FaEye, FaEyeSlash } from "react-icons/fa";

/**
 * Password field with a show/hide toggle. Forwards its ref and all Input props,
 * so it drops in anywhere a Chakra <Input /> goes — including react-hook-form's
 * register() spread.
 */
const PasswordInput = forwardRef<HTMLInputElement, InputProps>((props, ref) => {
  const [show, setShow] = useState(false);

  return (
    <InputGroup
      endElement={
        <IconButton
          variant="ghost"
          size="sm"
          tabIndex={-1}
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow((prev) => !prev)}>{show ? <FaEyeSlash /> : <FaEye />}</IconButton>
      }
    >
      <Input ref={ref} type={show ? "text" : "password"} {...props} />
    </InputGroup>
  );
});

PasswordInput.displayName = "PasswordInput";

export default PasswordInput;
