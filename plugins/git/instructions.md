Use workbench_git catalog first to see configured repository IDs and permissions.
Use only authorized repositories. Read status/diff before staging specific files;
never include unrelated work or credentials. Commit and push only within the user's
requested scope. Fetch updates remote tracking refs but does not merge local work.
Switch only to an existing branch; this tool does not reset or discard changes.

Platform issues/comments are external communication: require the user's instruction
to publish them. A permission in config permits the operation technically but is
not a request to send a message. Read back the created object/issue to verify.
On timeout or network failure, inspect whether a write landed before deciding what
to do next. Never automatically repeat a push, issue creation or comment.

If denied, explain the configured restriction. Do not use shell, browser, another
credential or URL to bypass policy. Configuration is operator-owned, not model-editable
through this tool. Chief delegates repository work to project sessions.
