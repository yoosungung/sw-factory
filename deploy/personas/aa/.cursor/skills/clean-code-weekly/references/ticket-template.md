# Finding ticket template

## Headline

`[clean-code] <smell_id> — <short path or symbol>`

Example: `[clean-code] bound.raw — src/payments/stripe_client.py`

## Body (HTML-friendly plain structure)

```html
<p><b>severity:</b> High|Med</p>
<p><b>smell_id:</b> …</p>
<p><b>heuristics:</b> … (ids from heuristics.md)</p>
<p><b>location:</b> path:line (optional end line)</p>
<pre>…minimal snippet…</pre>
<p><b>impact:</b> why this hurts changeability / defects / opacity</p>
<p><b>boy_scout:</b> smallest next patch (not a rewrite)</p>
<p><b>mechanical:</b> related command failure? yes/no + one-line summary</p>
<p><b>client_repo:</b> git url or repo id</p>
```

## Rules

- Status **New** on the client's `project_id` only.
- Not a feature Done field; not `aa: security pass|fail`.
- Snippet: enough to locate; redact secrets.
