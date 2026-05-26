# Delete Attendance — Design Spec

## Summary

Add a delete button to the ViewAttendance page so users can remove an attendance record. Uses the existing `confirmAlert` + `deleteRequest` pattern from the Organisations page.

## Endpoint

`DELETE /attendance/:organisationId/:id`

Added to `attendanceRequest` in `src/services/api/request.ts` as:
```
DELETE_ATTENDANCE: "/attendance/:organisationId/:id"
```

## UI

A red "Delete" button with a trash icon (`FaTrash`) placed in the top action bar of ViewAttendance, alongside the existing Share and Export to Excel buttons.

## Behaviour

1. User clicks Delete
2. `confirmAlert` dialog: "Are you sure you want to delete this attendance record? This cannot be undone."
3. On confirm: calls `deleteRequest` via `useMutationWrapper`
4. On success: invalidates `"all-attendance-12"` query, navigates to `PROTECTED_PATHS.ALL_ATTENDANCE`
5. On error: `toast.error` with server message or fallback

## Files Changed

- `src/services/api/request.ts` — add `DELETE_ATTENDANCE`
- `src/pages/ViewAttendance.tsx` — add button, mutation, handler
