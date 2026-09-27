# Read Bills

## Infra/Setup

1. Is Deno/Bun good for this type of project?
2. Is it best to set up as container project for easy deployment to homelab?

## Components to Reading Bills

- Check Email
- Parse Email
- Execute Actions

### Check Email

1. Connection to Gmail
2. How do we check for new emails?
3. How do we tell what is a new email?
4. How do we trigger every x mins?
5. What is output of email? HTML?

### Parse Email

1. How do we determine if an email is a bill?
2. Check for PDF attachments
3. If no PDF attachment, is there a link to a PDF?
4. Do we get context from the email?
5. Is there a PDF to pass onto actions? or email coswntents?

### Execute Actions

Implemented as a handler registry (`src/actions/`): actions are enabled and configured in `data/actions.json`, run sequentially per bill, and per-action results are persisted so a failed email can be flagged and reprocessed without repeating actions that already succeeded. See CLAUDE.md for details.

#### Actions 1 - Add to Calendar

1. Which calendar type is easiest to add to?
2. Which calendar is it added to?

#### Actions 2 - Pass Bill details to Paperless NGX

1. Connection to Paperless NGX
2. How to pass PDF to Paperless
3. Parsing context to fill in Paperless parameters