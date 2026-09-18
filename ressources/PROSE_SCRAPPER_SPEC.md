# Prose event parser specification

How to scrape and parse course events from the Prose planning page. Written for
an agent building a standalone scraper from scratch.

The scraper in `apps/scraper` has moved past section 1.3: waiting for the GWT
popup to detach is not enough on its own. See the DOM structure notes in
`AGENTS.md` before copying that part.

---

## 1. Browser automation

### 1.1 Viewport

Use a very large viewport, 3840x2160 for example. Prose is a legacy ExtJS
application that places event elements by pixel position. A small viewport can
leave events unrendered entirely.

### 1.2 Page loading

Navigate to the target URL directly. Wait for `div#Planning` to appear before
reading the HTML. It holds every event, and it shows up once the page is ready.

### 1.3 Week navigation

Prose uses an ExtJS toolbar where each week is a button. The currently displayed week has the
CSS class `.x-btn-pressed` on its button.

To find the current button's numeric ID:

```js
document.querySelectorAll('.x-btn-pressed')
// take the last element → extract the numeric suffix of its id attribute
// e.g. id="x-auto-42"  →  42
```

To navigate:

```js
// next week  →  click  #x-auto-{currentId + 1}
// prev week  →  click  #x-auto-{currentId - 1}
```

Wait for the page to finish loading after each click:

```js
await page.waitForSelector('.gwt-PopupPanel', { state: 'detached' })
```

The GWT loading popup detaches when the new week's data is ready.

Valid button range: IDs are bounded by the first and last child of `#x-auto-26`. Clicking
outside this range has no effect (the planning has no data beyond those bounds).

---

## 2. HTML structure

### 2.1 Events container

```html
<div id="Planning">
    <!-- one child div per event -->
</div>
```

Each child `div` is one course event.

### 2.2 Determining the day of an event

Each event `div` has an inline `left` style value:

```html
<div style="left: 420px; ...">...</div>
```

```
dayIndex = Math.floor(left / columnWidth)
```

To compute `columnWidth`, scan the header row at
`div.x-panel-body > div#x-auto-98 :nth-child(2) > table`, skipping the first
element. Iterate until you hit an element whose text you have already seen. The
`left` difference between that repeated element and the first one is the column
width.

### 2.3 Reading the week's dates

```js
querySelectorAll('div.labelLegend')
    .map((el) => el.textContent)
    .slice(1, 7) // skip first, keep 6 entries
    .map((t) => t.split(' ').at(-1)) // last word is the date  →  "dd/mm/yyyy"
```

Each date corresponds to a column index (0 = first day of the visible week).

---

## 3. Event text structure

The `.text` of each event `div` is a string with lines separated by `\n`.

### 3.1 Fixed positions

| Position   | Field | Always present |
| ---------- | ----- | -------------- |
| First line | Title | Yes            |
| Last line  | Hours | Yes            |

### 3.2 Middle lines (between title and hours)

```
[room line 1]       ← 0 or more
[room line 2]
[teacher line 1]    ← 0 or more
[teacher line 2]
[group line 1]      ← 0 or more
[group line 2]
```

The order is always rooms, then teachers, then student groups.

---

## 4. Identifying each line type

### 4.1 Hours (last line)

```
/^\d+h\d*\s*-\s*\d+h\d*$/
```

Examples: `9h00-11h00`, `14h-16h30`

### 4.2 Teachers

```
/[A-Z ]+ {3}[A-Z ]+/
```

The separator is 3 non-breaking spaces (`   `), not regular spaces.

Format: `LASTNAME   Firstname`

First name formatting (title-case): capitalize the first letter of each word segment
(split on spaces and hyphens), lowercase the rest.
Examples: `"JEAN-PAUL"` → `"Jean-Paul"`, `"FRANÇOISE"` → `"Françoise"`

### 4.3 Rooms vs student groups

No textual pattern distinguishes them. Use position:

- Lines **before** the first teacher line → rooms
- Lines **after** the last teacher line → student groups

With no teacher lines, rooms come first and student groups come after. Looking
the line up against known group `internalName` values in the database settles
the ambiguity, and an unmatched line is a room. Create student groups from the
text when the lookup finds nothing.

### 4.4 Edge cases

| Case                    | Behaviour                                           |
| ----------------------- | --------------------------------------------------- |
| 0 rooms                 | No room in output                                   |
| 0 teachers              | No teacher; apply positional split for rooms/groups |
| 0 student groups        | No group in output                                  |
| Multiple of any type    | Each line treated independently                     |
| Empty / whitespace line | Discard                                             |

---

## 5. Parsing algorithm (pseudocode)

```
function parseEventText(rawText, columnIndex, weekDates):
    lines = rawText.split('\n').map(trim).filter(not empty)

    hours_raw = lines.pop()     // last line
    title     = lines.shift()   // first line
    // remaining: rooms, teachers, groups in order

    teacher_lines = lines.filter(isTeacher)
    other_lines   = lines.filter(not isTeacher)

    if teacher_lines.length > 0:
        first_teacher_pos = lines.indexOf(teacher_lines[0])
        last_teacher_pos  = lines.lastIndexOf(teacher_lines.at(-1))
        rooms  = other_lines at positions < first_teacher_pos
        groups = other_lines at positions > last_teacher_pos
    else:
        // positional split + optional DB lookup for groups
        rooms  = other_lines before first known group
        groups = other_lines from first known group onward (auto-create if unknown)

    start, end = parseHours(hours_raw, weekDates[columnIndex])
    return { title, start, end, rooms, teachers, groups }


function isTeacher(line):
    return /[A-Z ]+ {3}[A-Z ]+/.test(line)  // spaces here are  


function parseTeacher(line):
    [lastName, firstName] = line.split(' '.repeat(3))
    return { firstName: toTitleCase(firstName.trim()), lastName: lastName.trim() }


function parseHours(raw, day):
    [startRaw, endRaw] = raw.split('-')
    // replace 'h' with ':', parse hours and minutes
    // build timestamps in UTC using the date from `day`
```

---

## 6. Output

| Object       | Fields                                             |
| ------------ | -------------------------------------------------- |
| Event        | `title`, `startDate` (UTC), `endDate` (UTC)        |
| Location     | `name` (raw room line, trimmed)                    |
| Teacher      | `firstName` (title-cased), `lastName` (upper-case) |
| StudentGroup | `internalName` (raw group line, trimmed)           |
