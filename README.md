# Todo for AnyWhere

[简体中文](README.zh.md) · [SDK](https://github.com/appdev/AnyWhere/blob/main/docs/plugin-services.md)

Import `appdev/anywhere-todo`, review and enable **待办 Todo**, then search `todo`. Requires the `notifications` host service. UI labels are Chinese.

Create/edit/complete/delete tasks with notes and priorities. Filter unfinished, today, upcoming, overdue and completed tasks, or search text. Save explicitly after editing. A blank reminder field means no notification.

One-time reminders use a future date. Daily/weekly reminders use the selected local time/weekday, beginning at the next match rather than an arbitrary distant start date. Completing a repeating task stops its recurrence; restoring it resumes the series. Editing replaces old reminders; completing/deleting cancels them.

Task data is saved before scheduling. Authorization failures and scheduling errors are shown separately from saved-data status. Allow notifications for AnyWhere in System Settings and retry **检查提醒状态**. Scheduled local notifications are owned by macOS and do not depend on the plugin page or app remaining open. Delivery presentation depends on system settings, Focus and device state; this is not an alarm while the computer is shut down.

Clicking a notification activates its task, including an existing independent window. Disabling the tool or uninstalling cancels notifications. Retained data survives reinstall; explicitly clearing pack data removes it. Limits: 1000 tasks, 50 active reminders, 800 KiB of data. Everything stays local; no account or synchronization.

No build or third-party dependencies. Run `node test.cjs`. Native `OfficialPluginTests` in the sibling AnyWhere repository exercises real forms, persistence and OS delivery; delivery checks require existing notification authorization and use a separate test namespace. Source is in `logic.js`, `app.js`, `index.html`, `style.css`. Capability: `notifications`. MIT.
