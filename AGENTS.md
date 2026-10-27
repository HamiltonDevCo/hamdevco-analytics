# AGENTS.md

## THIS REPOSITORY IS PUBLIC

Anyone can read every file, every commit message, every tag and the CI logs.
Sites install it straight from GitHub, so it stays public. Write it on that basis.

**Never put any of these in a file, a comment, a commit message, a tag or a PR:**

- **A client, a client's site or domain, or a product name** — ours or a client's.
  Use `example-client`, `example-site`, `my-app`, `example.com`.
- **A person's name.**
- **An incident.** No "this broke on site X", and no dates, durations, counts or
  session numbers from a real event. State the rule and the general
  failure mode instead: "a proxy that redirects drops every beacon body" — not
  where it happened or how long it went unnoticed.
- **An internal ticket ID, card ID, session link or dashboard / project ID.**
- **Business detail:** how many sites or clients we run, revenue, pricing, plans.
- **A real phone number or email address.** Use `(555) 010-0199` and `@example.com`.

The reasoning behind a rule is welcome. The story of where we learned it is not —
that belongs in the private wiki.

## Enforcement

`npm test` runs `scripts/public-check.mjs` over every tracked file. CI runs it on
every push and pull request, and checks the commit messages too. It fails on
protected names, ticket IDs, calendar dates, real domains, real phone numbers,
email addresses and incident phrasing.

Protected names are stored only as SHA-256 hashes in
`scripts/protected-names.json`. To protect a new client or product name:

```sh
node scripts/public-check.mjs --hash "Client Name"   # add the output to the JSON
```

Never commit the plain-text name, not even in that commit's message.

Install the local hooks once per clone, so a leak fails before it is committed:

```sh
git config core.hooksPath .githooks
```

The check is a net, not the rule. It cannot recognise an incident told without
its trigger words. Read your diff and your commit message before you push.
