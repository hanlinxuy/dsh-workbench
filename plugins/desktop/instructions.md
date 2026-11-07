Use workbench_desktop for native application tasks; use workbench_browser for webpages.
Read status and guide on first use. Snapshot a named app, choose its qualified refs,
act, and read a fresh snapshot/get to verify the actual effect. Never infer success
from a click return code. Refs are scoped to the calling DSH session; do not reuse
another project's refs. Read error disposition.retry: retry an action only when safe;
otherwise inspect state first. Do not guess stale refs.

The OS desktop is shared, not a sandbox. Operate only the apps/windows authorized
for this task. Do not read unrelated documents or change other users' work.
Semantic delivery is the default; a failure does not authorize switching to headed
physical input. Only the operator can enable headed mode in the plugin config.
Do not enter secrets in tool arguments; DSH records them. Existing app login is reused.
Chief coordinates through project sessions; project agents perform desktop work.
Do not run concurrent workflows on the same application window.
