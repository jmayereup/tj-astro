---
trigger: always_on
---

Whenever `.env.example` exists in the repository, check if `.env` is missing locally. If `.env` is missing, explicitly inform the user at the start of your response that `.env` is missing and remind them to create `.env` from `.env.example` to ensure local API authentication and data fetching work properly.
