# MaskedCity Event Archive

A browser userscript that preserves MaskedCity's temporary event results so you can review them after leaving the page.

**[Install / update](https://github.com/lvl11evelyn/mc-event-logger/raw/refs/heads/main/maskedcity-archive.user.js)** · **[Homepage](https://github.com/lvl11evelyn/mc-event-logger/blob/main/README.md)**

## What it does

Arena fight reports and Working the Streets results can disappear when you navigate away. This script automatically records supported result containers as they appear or change, saves them in your userscript manager's storage, and adds an archive panel for later review.

- **Arena:** opponent/report title, outcome, combat log, rewards, and battle statistics.
- **Streets:** result story, cash, EXP, reputation, street progression, witnesses, alliance gains, bonus breakdown, momentum, boosts, and street level.
- **The Hollow:** opponent, remaining health, experience, reputation, equipment experience/level-ups, the fight's stat gain, currency drops, and pawn-item drops. Hidden stale reward fields and resource-find panels are excluded.
- **Pet feeding:** individual meals on `/pets/<id>`, including food, displayed EXP/life gains, and any notice appended to the feeding result, such as a level-up.
- **Special rewards:** labels inside `.reward-banner .reward-label` (including Streets' Lucky Break rewards), plus the older `SPECIAL REWARD:` format. Points, Explore Turns, Energy, Scraps, Intelligence, and other banner labels are captured without depending on icons or emoji.
- **Manual capture:** save the current main game container for other events that do not yet have an automatic detector.
- **Export:** download JSON for structured records or an HTML archive you can read offline.

The script runs on HTTPS pages at `maskedcity.com` and `www.maskedcity.com`. Paths beginning with `/wiki` are excluded.

## Requirements

Install **one** userscript manager in a current browser:

- [Tampermonkey](https://www.tampermonkey.net/)
- [Violentmonkey](https://violentmonkey.github.io/get-it/)

Use the manager's official installation links to select a version available for your browser. No separate application, server, account, or build step is required. Enable only one installed copy of this logger to avoid duplicate captures.

## Installation

1. Install Tampermonkey or Violentmonkey and enable it for MaskedCity.
2. Open the **[userscript installation link](https://github.com/lvl11evelyn/mc-event-logger/raw/refs/heads/main/maskedcity-archive.user.js)**.
3. Review the script in your manager's installation screen and choose **Install**.
4. Reload any open MaskedCity tabs. The **MaskedCity Archive** control appears at the bottom left.

If the link displays or downloads the source instead of opening an installer:

1. Open your userscript manager's dashboard and create a new script.
2. Replace all starter content with the complete contents of `maskedcity-archive.user.js`, including its metadata block.
3. Save, ensure the script is enabled, and reload MaskedCity.

If your manager reports that browser permission or a userscript setting is required, follow its browser-specific setup instructions. See the official [Tampermonkey documentation](https://www.tampermonkey.net/documentation.php) or [Violentmonkey guide](https://violentmonkey.github.io/guide/creating-a-userscript/).

## Using the archive

**Arena, Streets, Hollow fights, and pet meals capture automatically.** Perform your normal game actions; you do not need to press Capture page for supported results.

| Control | Function |
| --- | --- |
| **Review** | Toggle the archive open or closed; expand an event heading to read its sections. |
| **Capture page** | Manually save the main game content while an event is still visible. |
| **Refresh** | Reload the archive list, including records saved by other tabs. |
| **Export JSON** | Download structured events and their saved revisions. |
| **Export HTML** | Download a standalone, readable archive with collapsible events. |
| **Close** | Dismiss the archive panel. |
| **× Delete** | Remove one saved record, using the button inside its expanded body. |
| **Undo delete** | Restore the most recently deleted record while this page remains open. |

The userscript manager's script menu also provides review, manual capture, and export commands.

Each expanded event has a red **×** at the top-right of its body, below the heading beside its metadata. It removes that event and all its revisions. Pet meals have a compact delete button visible when their pet disclosure is expanded. Deleted records disappear from Review and subsequent exports; existing downloaded exports are unaffected. **Undo delete** appears in the toolbar after a deletion and restores the latest deleted record. The undo copy exists only in memory for the current page and is replaced by the next deletion. A small marker prevents the current live observation from being recreated by the observer; reloading a still-visible game result can create a new observation as usual.

Event headings show the observation time and event name on the left, with special rewards on the right. All displayed timestamps use MaskedCity server time (Pacific, America/Los_Angeles), including pet meals, revision headings, tooltips, HTML exports, and export filenames. New records read the visible #hudServerTimeText clock and the adjacent #v2ClockDate date. If the header is unavailable, Pacific time is derived from the observation instant with daylight-saving rules. Older records are displayed in Pacific time as well. JSON retains UTC observation instants and includes separate server-clock metadata.

Streets rewards are captured as soon as the result appears, including banners added after the initial result. Performing the next action can replace the live result, but the prior record retains its reward. If an older saved record includes the supplied `Lucky Break! Bonus reward received.` banner text followed by its amount, its header can display that reward too. Missing content that was never saved cannot be recovered. Duplicate labels expressed in both the banner and old prefix format are shown once.

Events are organized into **STREETS** and **FIGHTS** disclosures, initially collapsed. Expand a type to browse its events, then expand an event to read its sections. Manual captures and any other event types appear under **OTHER** when present. Group headings have centered labels, right/down disclosure arrows, rounded corners, and lighter hover backgrounds. Refresh preserves both group and event expansion states. HTML exports use the same grouping.

**THE HOLLOW** has its own disclosure, separate from Arena fights. Its heading shows color-coded **Spd**, **Pow**, and **Str** totals from the retained Hollow fight records. Each fight contributes its latest recorded direct stat award once; earlier revisions and equipment-level bonuses do not add to those totals. Deleting or restoring a fight updates the totals. There is no cumulative ectoplasm total.

Hollow event headings read `timestamp - opponent - ectoplasm - stat gain`, with equipment level-up notices on the right. Expanded records show only the result, remaining health, EXP/reputation, equipment progress, direct stat gain, currency, and item drops, plus any level-up notices. The running combat log, dungeon map, and unrelated page content are not recorded. Equipment rows marked `is-up`, such as `Grave Digger — Lv 20! +11 ATK +7 POW +5 STR`, are recognized as level-ups. Hollow records do not use the Arena/Streets special-reward parser.

The native Hollow result panel is reused. Capture distinguishes completed fights from encounters, empty entry states, and finds such as Scraps, even when the latter retain hidden `VICTORY`/reward text. Only active reward rows in the visible completed fight count. Consecutive rewrites of the result marker identify new observations, including identical opponents and rewards; later reward/detail changes update the same observation. As with other record types, reloading a still-visible result can create another observation.

Pet feeding histories appear in a compact row with three equal-width slots. Each recorded pet has a disclosure headed by its name; expanding it shows meals newest first, with appended notices on a separate divided line. Only pets with captured meals appear. Histories are grouped by the individual pet ID, so shared names do not merge pets. The archive retains historical pets and wraps additional histories onto another row rather than deleting them. Each meal displays a small, fixed-length server-time timestamp in `HHmm-DD-MM` format, such as `0902-17-10`. Hover over the timestamp for the full date and time, including the year. Pet histories are included in both export formats.

Consecutive meals are recorded separately even when the page URL stays the same. New result elements and changes to the feeding notification identify subsequent observations, including identical text rewritten into the same element. Merely reopening Review or changing unrelated page content does not add a meal. The script preserves any text appended after the meal's gain summary without depending on exact level-up wording.

The current one-tap feeding UI is supported through its live `#petFeedMsg` result element; older `.alert` feeding results remain supported. Capture observes text changes without a page reload and also reads results inside the collapsed feed box. Food-card animations, meal counters, and failed-feed messages do not create meal entries.

Level-ups also use a distinct result format, such as `Cydaea ate Brawler Brunch and leveled up to Level 17! (+1 treat)`. The logger records the meal with the level/treat notice on a separate line before the game's delayed reload. This message omits EXP/life gains from the DOM; the logger leaves those values absent rather than guessing them from the food card or intercepting network traffic. The complete result text remains in the JSON record.

The panel expands with your viewport, up to 1,500 pixels tall and 1,180 pixels wide. Clicking outside it closes it while allowing that click to reach the game beneath it, including a visible **Fight Again** button. You can also close it with **Escape**. Opening the archive does not block the surrounding page.

The lower-left control block's background, border, text, and Review button are fully transparent while idle. Hovering or keyboard focus reveals them over 0.1 seconds with no delay. After leaving, it waits 0.25 seconds and disappears over 0.2 seconds. **Capture page stays fully opaque and clickable throughout.** Buttons use the site's `--font-ui` family at 13px. Reduced bottom padding and a status message positioned above the block keep the capture button close to the footer's bottom edge. A mouse click does not leave the block permanently visible after the pointer moves away. Reduced-motion preferences disable these transitions.

## Updates

The metadata points both `@updateURL` and `@downloadURL` to the repository's raw userscript URL. Automatic update checks follow your userscript manager's settings. You can also use the manager's update check or reopen the **[install / update link](https://github.com/lvl11evelyn/mc-event-logger/raw/refs/heads/main/maskedcity-archive.user.js)**.

When updating manually, replace the contents of the **existing script entry**, save, and reload game tabs. Keep the same entry to retain its stored archive. Export a backup before removing or reinstalling the script.

For maintainers: increment `@version` when publishing changes so userscript managers can detect a newer release.

## Storage and privacy

Records are saved through the userscript manager's script-storage API and remain available across ordinary navigation and browser restarts. The logger does not upload event records or make its own network requests. Userscript-manager update checks and any browser or extension synchronization settings operate separately.

Captured snapshots discard scripts, forms, input values, buttons, embedded resources, and copied HTML attributes. Source metadata omits URL query strings and fragments. Exports still contain game information such as player names and rewards, so review them before sharing.

There is no automatic expiry or deletion. Removing script data, uninstalling the manager, or deleting the relevant browser profile may remove your archive. Keep periodic exports. JSON import is not currently implemented; HTML exports remain readable independently of the script.

## Limitations

- Capture starts after the script loads. It cannot recover results that have already disappeared.
- Automatic detection currently supports the supplied Arena, Streets, Hollow fight, and pet-feeding layouts. Other layouts may require manual capture or a detector update.
- The archive preserves observed content; it does not restore the original game page through browser Back/Forward navigation.
- Timestamps describe when your browser observed a result, not an authoritative server event time.
- Changes to a result container are saved as revisions. Reloading a result may create another observation of the same event; a reused container may hold multiple results as revisions.
- Pet feeding notifications have separate meal identities rather than using the pathname as an event ID. A notification rewritten by the site can count as another observation even if it repeats an earlier message; a feeding that produces no observable DOM change cannot be detected.
- Content never rendered in the DOM, or overwritten before the observer can read it, cannot be guaranteed captured.
- HTML exports preserve readable content and sections rather than the game's exact styling or active controls.

## Troubleshooting

**No archive control:** confirm the manager and script are enabled, check site permissions, reload the page, and make sure you are on a supported game page outside `/wiki`.

**No saved event:** open Review after your next normally planned action. If the result is still visible but has not been captured automatically, use Capture page before navigating away. A changed game layout may require a detector update.

**Save failed:** check your userscript manager's storage availability. Export any accessible records before clearing data or reinstalling.

For capture problems, [open an issue](https://github.com/lvl11evelyn/mc-event-logger/issues) describing the event type, browser, manager, and script version. If you include a DOM sample, remove form tokens, credentials, and unrelated private content first.
