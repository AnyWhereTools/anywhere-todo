# Todo for AnyWhere

[简体中文](README.zh.md) · [SDK](https://github.com/AnyWhereTools/AnyWhere/blob/main/docs/plugin-services.md)

Import `AnyWhereTools/anywhere-todo`, review and enable **待办 Todo**, then search `todo`. Requires the `notifications` host service. UI labels are Chinese.

Quick-add with Enter, organize tasks into custom lists, and edit notes, priority, deadline and reminder in a detail pane. The responsive layout supports narrow panels, wide windows and dark mode. Deleting a list moves its tasks to the inbox. Completion and deletion support one-step undo until the next successful mutation or page closure.

Today includes due-today, overdue and today-reminder tasks. Upcoming shows the next seven days by deadline, falling back to the next reminder date when no deadline exists. Inbox, All and Completed provide separate views. Search titles/notes within the current view; sort by date, priority or creation. Quick-add in Today assigns today's deadline; quick-add in a list assigns that list. Shortcuts: Cmd+N/F/S and Escape.

Deadlines and reminder times are independent. A task due today is overdue only on the next local day. Save explicitly before closing the window. A blank reminder field means no notification.

One-time reminders use a future date. Daily/weekly reminders use the selected local time/weekday, beginning at the next match rather than an arbitrary distant start date. Completing a repeating task stops its recurrence; restoring it resumes the series. Editing replaces old reminders; completing/deleting cancels them.

Task data is saved before scheduling. Authorization failures and scheduling errors are shown separately from saved-data status. Allow notifications for AnyWhere in System Settings and retry **检查提醒状态**. Scheduled local notifications are owned by macOS and do not depend on the plugin page or app remaining open. Delivery presentation depends on system settings, Focus and device state; this is not an alarm while the computer is shut down.

Clicking a notification activates its task, including an existing independent window. Disabling the tool or uninstalling cancels notifications. Retained data survives reinstall; explicitly clearing pack data removes it. Limits: 1000 tasks, 30 lists, 50 active reminders, 800 KiB of data. Everything stays local; no account or synchronization.

Legacy schema 1 tasks retain IDs, content, completion and reminder times; reminders are not converted into deadlines. The first mutation writes schema 2 and saves the original document as `todos.v1Backup`. Unsupported or corrupt data disables editing without overwriting it. Do not edit upgraded data with an older plugin. Each mutation re-reads storage and rejects stale task edits, preserving unsaved input. Use one editing window: the host has no transaction/CAS API for simultaneous writes.

No build or third-party dependencies. Run `node test.cjs`. Native `OfficialPluginTests` in the sibling AnyWhere repository exercises real forms, persistence and OS delivery; delivery checks require existing notification authorization and use a separate test namespace. Source is in `logic.js`, `app.js`, `index.html`, `style.css`. Capability: `notifications`. MIT.
