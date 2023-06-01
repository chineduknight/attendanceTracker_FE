export const authRequest = {
  LOGIN: "/users/login",
  GET_ME: "/users/me",
  SIGN_UP: "/users/signup",
};

export const orgRequest = {
  ORGANISATION: "/organisations/:organisationId/members",
  CATEGORY: "/organisations/:organisationId/category",
  SUBCATEGORY: "/ organisations/:organisationId/sub-category",
  ORGANISATIONS: "/organisations",
  MEMBERS:"/organisations/:organisationId/members",
  CONFIG_MODEL:"/organisations/:organisationId/model",
  // organisations/:organisationId/members
};

export const attendanceRequest = {
  ATTENDANCE:"/attendance",
  GET_ATTENDANCE:"/attendance/:organisationId/:id",
  ALL_ATTENDANCE:"/attendance/:organisationId",
  EXPORT:"/attendance/export/:organisationId/:id"
}
