# Profile privacy settings (P0.7)

`GET /api/v1/profiles/me/privacy` and `PUT /api/v1/profiles/me/privacy`
(send only the fields to change). Defaults keep the behaviour from before
these settings existed.

| Field               | Values (default first)             | Effect                                                                                                                                                                                                      |
| ------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `photoVisibility`   | `EVERYONE`, `AFTER_HIRE`, `NOBODY` | `photoUrl` is null on the public profile and in the directory unless allowed. `AFTER_HIRE` = the viewer has a confirmed, completed or cancelled assignment with the person.                                 |
| `showFullName`      | `false`, `true`                    | `false` shows "Rahima K." on the public profile, directory and applicant list.                                                                                                                              |
| `hidePreciseArea`   | `false`, `true`                    | `true` makes `location` null (the ~500 m point); the area name stays.                                                                                                                                       |
| `allowMessagesFrom` | `ANYONE`, `ENGAGED_ONLY`           | `ENGAGED_ONLY`: starting a new conversation with the person needs a hire between the two (`403 MESSAGES_NOT_ALLOWED`). Existing conversations keep working.                                                 |
| `discoverable`      | `true`, `false`                    | `false` leaves the worker out of `GET /users/workers` and suggested workers; their profile and slots return 404 except to people already dealing with them (an application, offer or hire between the two). |

Signed-in viewers should send their bearer token to the public routes
(`GET /users/workers`, `GET /users/:id/public`) so blocks and "after hire"
rules apply to them; without a token they are treated as anonymous.

## Availability slots

`GET /api/v1/workers/:workerId/availability/slots` is for booking only:
customer or business role (403 otherwise), dates that are not in the past
(400), not across a block and not for a hidden worker the viewer has no
dealings with (404), at most 60 lookups per viewer per hour (429 with
`Retry-After`).
