export const authRequest = {
  LOGIN: "/users/login",
  GET_ME: "/users/me",
  SIGN_UP: "/users/signup",
};

export const orgRequest = {
  ORGANISATION: "/organisations/:organisationId/members",
  CATEGORY: "/organisations/:organisationId/category",
  SUB_CATEGORY: "/organisations/:organisationId/sub-category",
  ORGANISATIONS: "/organisations",
  MEMBERS:"/organisations/:organisationId/members",
  CONFIG_MODEL:"/organisations/:organisationId/model",
  BIRTHDAY: "/organisations/:organisationId/members/birthday",
  BIRTHDAY_EXPORT_PDF: "/organisations/:organisationId/members/birthday/export/pdf",
  BIRTHDAY_EXPORT_EXCEL: "/organisations/:organisationId/members/birthday/export",
  // organisations/:organisationId/members
};

export const attendanceRequest = {
  ATTENDANCE:"/attendance",
  UPDATE_ATTENDANCE:"/attendance/:attendanceId",
  GET_ATTENDANCE:"/attendance/:organisationId/:id",
  ALL_ATTENDANCE:"/attendance/:organisationId",
  EXPORT:"/attendance/export/:organisationId/:id",
  ANALYTICS: "/attendance/:organisationId/analytics",
  ANALYTICS_EXPORT_EXCEL: "/attendance/:organisationId/analytics/export/excel",
  ANALYTICS_EXPORT_PDF: "/attendance/:organisationId/analytics/export/pdf",
};
