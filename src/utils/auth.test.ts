import { signedInUserId } from "utils/auth";

/** An unsigned JWT-shaped token carrying `payload`. */
const tokenWith = (payload: object) =>
  `header.${btoa(JSON.stringify(payload)).replace(/=+$/, "")}.signature`;

describe("signedInUserId", () => {
  it("uses the stored user id", () => {
    expect(signedInUserId({ id: "u1", token: tokenWith({ id: "u2" }) })).toBe("u1");
  });

  it("falls back to the token's id claim before /users/me has filled in the id", () => {
    expect(signedInUserId({ id: "", token: tokenWith({ id: "u2", exp: 1 }) })).toBe("u2");
  });

  it.each([
    ["signed out", ""],
    ["an opaque token", "not-a-jwt"],
    ["a token without an id", tokenWith({ exp: 1 })],
    ["a non-string id", tokenWith({ id: 7 })],
  ])("is null when %s", (_label, token) => {
    expect(signedInUserId({ id: "", token })).toBeNull();
  });
});
