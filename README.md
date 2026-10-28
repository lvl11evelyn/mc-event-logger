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
| **Refresh** | Reload docked and popped-out sections, including records saved by other tabs. |
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

**Review** and **Capture page** float separately at the lower left, fully opaque at all times, with no shared backing panel or hover fade. Buttons use the site's `--font-ui` family at 13px.

The main panel opens directly above the buttons and grows upward only as much as its contents need. It is up to 1,180 pixels wide. Once its contents fill the available viewport height, the event area scrolls instead of extending beyond the top edge. The buttons remain outside the panel's bounds and accessible at every size. Clicking outside the archive closes the main panel while letting that click reach the game beneath it, including a visible **Fight Again** button. **Escape** closes the main panel too. Neither action hides popped-out sections.

Docked category bodies and pet meal lists have a maximum height of 40vh and scroll independently, with thin scrollbars using the site’s `--align` color.

### Floating sections

Each category and each pet history has a popout toggle in its header's upper-left corner:

1. Click **↗** to detach that section into a floating window. Its expanded entries remain expanded.
2. Click the header normally to expand or collapse the section. Click and drag the header to move the window; dragging does not toggle it.
3. When expanded, drag either lower corner to resize the window's width and height. Long content scrolls inside the resized window. Focus a corner and use arrow keys for 10-pixel adjustments, or Shift plus arrow keys for 40-pixel adjustments.
4. Click **↙** to return the section to its original location in the main panel. Docking it while the main panel is closed does not reopen the panel.

Section headers stay on one line, and each popout’s minimum width is measured from its full header so resizing cannot clip its text. Popouts are available at viewport widths of 768 px and above, provided the header fits. Below 768 px the popout controls are hidden; existing popouts automatically dock without opening a hidden main panel.

Popouts remain visible and usable when the main panel closes, and can be parked partly off-screen. Position limits keep at least 50 px of each header’s width and half its height inside the viewport so it remains reachable for dragging. The body may extend outside the viewport, and resizing is no longer capped at viewport edges. Several sections can float at once; interacting with one brings it forward. New captures update open sections, including popouts. Refresh preserves expanded entries, section state, window position, size, and scroll position where possible. Delete and Undo also update the relevant sections without reopening a hidden main panel.

Window layout is kept for the current page. Reloading or navigating starts with docked sections; saved event records remain in userscript storage. If the final meal in a popped-out pet history is deleted, that empty window is removed. Undo restores its record as a docked history. HTML exports remain standalone collapsible archives without dragging, docking, resizing, or delete controls.

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

### Ingredient drops

Version 0.6.1 recognizes the result message `Picked up for the Lab: <item>.` and shows an Ingredients row under Arena Rewards or Streets Take. It preserves the item label and any quantity supplied by the game, without adding an assumed quantity. New captures store `ingredientDrops` in JSON; the panel and HTML export also recover this message from existing saved event text. Version 0.6.2 adds a green (`#6dbf30`) `⨃⁺¹` indicator at the far right of event headers. The superscript is the total ingredient quantity; explicit quantities are summed, and each unquantified item counts as one. As of version 0.6.3, hovering the indicator lists the ingredients received, including any recorded quantities. The indicator also appears in HTML exports and is recovered for older saved events.

The supplied October 23 archive confirms Adrenal Extract drops in both newest arena fights. Streets support uses the same result message within the captured result/outcome/context; a different Streets message would require another DOM example.

### Poker pages

Version 0.6.6 hides the floating Review and Capture page controls on `/poker` and `/poker/*`. They return when you leave Poker, including navigation without a full page reload.
