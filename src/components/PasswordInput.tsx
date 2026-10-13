import { forwardRef, useState } from "react";
import { Input, InputGroup, IconButton, InputProps } from "@chakra-ui/react";
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
      endElementProps={{ pe: 0 }}
      endElement={
        // 44px tap target inside a 40px field: plain variant, so the extra
        // 2px above and below has nothing to draw. In the tab order so
        // keyboard users can check what they typed; type="button" so
        // toggling never submits the surrounding form.
        <IconButton
          type="button"
          variant="plain"
          color="fg.muted"
          boxSize="44px"
          minW="44px"
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow((prev) => !prev)}
        >
          {show ? <FaEyeSlash /> : <FaEye />}
        </IconButton>
      }
    >
      <Input ref={ref} type={show ? "text" : "password"} {...props} />
    </InputGroup>
  );
});

PasswordInput.displayName = "PasswordInput";

export default PasswordInput;
