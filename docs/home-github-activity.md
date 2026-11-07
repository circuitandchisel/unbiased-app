# GitHub activity on Home

Home reads PR metadata through an existing GitHub CLI login on github.com. It makes no GitHub mutations, does not start a login flow, and does not read PR bodies or code. The GitHub identity is independent of the app account and is displayed as @login.

With no calendar date selected, the cards show the current calendar month. Selecting a date switches the summary and PR cards to that local day and lists separate opened and merged events in the activity section below. Clearing the date restores the monthly view. PR lists have bounded heights and scroll vertically, with the fetched events available inside the card. Clicking a PR opens the side in-app browser and reuses a matching tab without reloading; the existing browser-tab capacity fallback applies. Creation and merge timestamps determine the events; current PR state alone does not establish when an event happened. A PR can contribute to both counts.

The scope is PRs authored by the GitHub user, including their PRs merged by someone else. This does not count merges of other authors' PRs, reviews, historical close/reopen events, or all organization activity. The chat heatmap continues to measure chat creation only.

All projects includes all repositories accessible to the CLI account. A project filter resolves GitHub origin remotes from the app-owned saved project folders. It never accepts a renderer-supplied repository or directory and never broadens an unlinked project to all repositories.

Queries use local midnight boundaries converted to UTC, including DST day lengths, and GitHub's inclusive second-precision date range syntax. Separate creation and merge searches return total counts and up to 100 PRs each. Lists are deduplicated before deriving separate events; when a search has more pages, the UI explicitly marks the displayed list as partial while retaining the full matching counts.

Results stay in memory for 60 seconds, keyed by CLI identity, repositories, and date range. CLI identity is checked before cached results are returned. Refresh reruns the request but still respects this cache window. Changing date or project ignores late results from the old selection. Missing CLI authentication, network errors, rate limits, and GraphQL errors show unavailable rather than zero activity. Project origin folders are re-resolved on each request.
