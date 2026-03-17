---
name: Footer link order convention
description: Contact always rightmost in footer; new links go to the left of existing ones
type: feedback
---

Contact must always be the rightmost link in `.footer-links`.
When adding new footer links, insert them to the left of the existing link structure (i.e., before LinkedIn, which is currently first).

Current order: LinkedIn → GitHub → Contact

**Why:** User explicitly set this convention so Contact stays anchored to the far right as a consistent endpoint.

**How to apply:** Any time a footer link is added, prepend it before the current leftmost link (LinkedIn), never append after Contact.
