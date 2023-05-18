export const authRequest = {
  LOGIN: "/users/login",
  GET_ME: "/users/me",
  SIGN_UP: "/users/signup",
};

export const orgRequest = {
  ORGANISATION: "/organisations/:organisationId/members",
  ORGANISATIONS: "/organisations",
  MEMBERS:"/organisations/:organisationId/members",
  CONFIG_MODEL:"/organisations/:organisationId/model"
};

export const attendanceRequest = {
  ATTENDANCE:"/attendance"
}