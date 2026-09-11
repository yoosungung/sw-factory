# Gateway dispatch (의사코드)

```text
loop:
  events = GET /api/agent/events?after_id=checkpoint.acked_id
  for e in events:
    targets = route(e)   # assignee, mentions; apply self-echo; skip human
    if targets empty:
      ack(e.id); continue
    for persona in debounce_merge(targets, e):
      prompt = render(e.event_type, e.ticket_id)
      sticky = map.get(e.ticket_id, persona)
      try:
        if sticky:
          r = POST cursor /sessions/{sticky}/prompt {prompt, ticket_id, event, persona}
        else:
          r = POST cursor /sessions {prompt, ticket_id, event, persona}
        if r.status in (200, 202):
          map.save(…); ack_progress(e)  # all targets ok → acked_id=e.id
        elif r.reason == sdk_zombie:
          drop sticky; recreate; else enqueue_retry(e, persona)
        else:
          enqueue_retry(e, persona)      # do not advance acked_id for this e
      catch timeout/5xx:
        enqueue_retry(e, persona)
  flush_retry_queues_round_robin()
```

## route(e) 요약

```text
if e.actor is bot AND e.actor == e.assignee AND e not mention-to-other:
  skip actor (self-echo)
add assignee if type=sessions
add each mention_user_id if type=sessions
return unique personas
```

## retry UPSERT 키

`(ticket_id, persona)` → 최신 body; `attempts`; flush if attempts < 5.
