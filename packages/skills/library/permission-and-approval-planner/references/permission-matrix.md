# Platform permission default

This matrix is not an organization policy. Replace it when the task attaches one.

| Action | Class |
|---|---|
| Read local task files and enabled skills | automatic |
| Write a new file in the task workspace | automatic |
| Overwrite a file the user supplied as source | approval-required |
| Read a connector the user already connected | automatic |
| Create or update an external record | approval-required |
| Send email, chat, or a calendar invite | approval-required |
| Delete a file, record, branch, or skill | approval-required |
| Publish, deploy, merge to a protected branch, or rotate a secret | approval-required |
| Purchase, subscribe, or accept a paid quote | denied until a named approver confirms the amount |
| Copy a secret into a prompt, file, log, or reply | denied |

Confirmation must name the object. "Go ahead" applies only to the action last shown. A new recipient or a new amount needs a new confirmation.

Persistent authorization does not exist in this package. A previous task's approval does not carry over.
