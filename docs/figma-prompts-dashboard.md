# Figma Implementation Prompts: Dashboard

Use these prompts with Figma's generative design or manual design tools to create the dashboard UI.

---

## Prompt 1: Dashboard Layout Frame

```
Create a dashboard web app frame with:
- Header bar (64px height) containing:
  - Logo/title "Tech Success"
  - Search bar (300px wide) with placeholder "Search tickets or people"
  - Theme toggle button (dark/light)
  - User avatar (32px circle, right-aligned)
- Left sidebar (240px width, collapsible hamburger on mobile) containing:
  - "Team members" section with 8 avatars, 32px each
  - "Filters" section with checkboxes: High Priority, Breached, Paused
  - Settings link at bottom
- Main content area with 12-column grid
- Background: white (light) / #1F2937 (dark)
- Spacing: 24px padding on main sections
- Use Inter or system font
```

---

## Prompt 2: Ticket List Card (Responsive Table)

```
Create a ticket list component showing open requests by assignee:
- Each row 56px height, padded 12px
- Columns: [Status icon] [Priority chip] [Ticket key] [Summary] [Assignee] [Age] [SLA status]
- Status icon: 8px circle, color = semantic (red=breached, amber=warning, green=healthy)
- Priority chip: Colored badge (red=Critical, orange=High, yellow=Medium, purple=Low)
- Ticket key: Monospace 14px, clickable
- Summary: 14px primary text, truncate at 50 chars
- Assignee: Avatar 32px + name
- Age: "3h 45m" in secondary text
- SLA status: "38m overdue" in red, or "2h 14m remaining" in green
- Hover: Background #F3F4F6, subtle shadow
- Breached row: Left border 4px red, background tinted red 5%
- Mobile: Hide Summary and Age columns; stack Age below ticket key in small text
- Paused row: 60% opacity, "Waiting for customer" label overlay

Include examples for 5 rows with different states (breached, warning, healthy, paused, critical).
```

---

## Prompt 3: Assignee Summary Card

```
Create a summary card for one team member:
- Width: 300px
- Height: 200px
- Card styling: 8px border-radius, 1px border #E5E7EB, white background, shadow
- Content:
  - Large avatar 48px (top-left)
  - Name 18px 600 weight (next to avatar)
  - Role "Support Tier 1" 12px secondary text (below name)
  - Three stats in a row:
    * Total: "12" large, "open tickets" small label, primary text
    * Breached: "3" large red, "due now" label
    * Avg response: "4h 20m" large, "this month" label
- Bottom: Link "View all →" tertiary button
- On mobile: Stack to 2 columns, 250px width

Include 3 cards showing different workload levels (light, medium, heavy/breached).
```

---

## Prompt 4: SLA Trends Chart

```
Create two trend charts side by side:

Chart A: Response time by priority (30/90 day comparison)
- Type: Grouped bar chart
- X-axis: Critical, High, Medium, Low
- Y-axis: Hours (0-24h)
- Series 1 "30 days": Use semantic colors (red/orange/yellow/purple)
- Series 2 "90 days": Same colors at 70% opacity
- Values labeled on bars
- Grid: Dashed #E5E7EB, light style
- Tooltip: Dark card with white text on hover

Chart B: Breaches over time (last 60 days)
- Type: Line chart
- X-axis: Date (Mon, Wed, Fri labels)
- Y-axis: Count (0-10 breaches)
- Line: Red (#EF4444), 2px stroke
- Area below line: Red at 10% opacity
- Points: 6px circles at data points
- Trend annotation: "↑ +2 from last month" in amber, 12px

Both charts:
- 48px padding
- Title: 18px 600 weight (Chart A: "Response time by priority", Chart B: "Breaches this month")
- Legend: Horizontal, 12px labels
- Responsive: Stack vertically on mobile
```

---

## Prompt 5: Admin Chat Interface

```
Create a chat messaging interface:

Left sidebar (300px):
- "Chat history" heading
- Searchable list of recent queries:
  - "Why is DC-844 skipped?"
  - "What's Uyanga's load?"
  - "How are we trending?"
  - "Show high-priority tickets"
- Timestamps: "2h ago", "1d ago", etc.
- Hover: Background #F3F4F6, subtle highlighting

Main area (right side):
- Message list, scrollable
- Message bubbles:
  * User message: Right-aligned, blue background (#3B82F6), white text, 80% max width, 8px border-radius, 8px padding
  * System response: Left-aligned, gray background (#F3F4F6), primary text, 80% max width, 8px border-radius, 8px padding
- Include 4 example exchanges:
  1. User: "What's happening now?" → Response with counts (5 due, 3 critical, 2 high)
  2. User: "Why is DC-844 skipped?" → Response with full trace (not breached, paused reason, etc.)
  3. User: "Who's overloaded?" → Response listing top 3 people with counts
  4. User: "Show trends" → Response with link to trend charts

Input area (fixed bottom):
- Textarea: 48px height, 8px padding, 6px border-radius, focus outline #3B82F6
- Placeholder: "Ask about tickets, load, or trends..."
- Send button: Blue background (#3B82F6), white text, 32px height, icon + "Send"
- Attach/suggest button (optional): Tertiary button next to input

Typography:
- User message: 14px
- System response: 14px
- Timestamp in bubbles: 12px secondary text
- Input placeholder: 14px secondary text
```

---

## Prompt 6: Dashboard Header & Search

```
Create dashboard header:
- Height: 64px
- Background: White (light) / #111827 (dark)
- Border bottom: 1px #E5E7EB

Left section:
- Logo/icon 24px
- Title "Tech Success" 18px 600 weight, margin-left 12px

Center section:
- Search input:
  * Width: 300px
  * Placeholder: "Search tickets, people, or trends..."
  * Icon: Magnifying glass (left-side, 16px)
  * Border: 1px #D1D5DB, 6px border-radius
  * Padding: 8px 12px
  * Results dropdown: On focus, show 3 recent + 3 suggested searches
  * Mobile: Full width minus margins

Right section:
- Filter button: Icon + "Filters" (tertiary)
- View toggle: Icons for list / card view
- Theme toggle: Sun/moon icon
- User avatar: 32px circle, clickable (shows profile menu on click)
- Spacing: 12px between elements
- Padding: 16px horizontal

Responsive:
- Desktop: All elements visible
- Tablet: Hide some icons, keep search and avatar
- Mobile: Hamburger menu replaces logo; search becomes icon only
```

---

## Prompt 7: Empty States & Loading

```
Create three screens:

Screen A: Empty ticket list (no open tickets)
- Icon: File/inbox icon, 48px, secondary text color
- Heading: "No open tickets"
- Subheading: "Great work! All tickets are resolved or paused."
- Background: Card styling, centered on page
- Action: "View closed tickets" link

Screen B: Loading state
- Skeleton loaders for ticket rows (5 rows)
- Each skeleton:
  * Animated pulse gray (#E5E7EB), 8px border-radius
  * Mimics row structure: small rect (icon), chip, bar, bar, avatar + text, text, text
  * Animation: 1s loop, fade in/out
- Text below: "Loading your team's tickets..."

Screen C: Error state
- Border: 2px solid #EF4444
- Background: Red tinted (#FEE2E2)
- Icon: Alert icon, 32px red
- Heading: "Unable to load tickets" (18px, red)
- Message: "Jira is unreachable. Please check your connection and try again."
- Button: "Retry" (primary blue)

All: Center content on page, max-width 400px
```

---

## Prompt 8: Dashboard Sidebar Filters

```
Create left sidebar filter panel:

Header:
- "Team members" section with avatars
- 8 circular avatars, 32px each, arranged in 2 rows
- On hover: Name tooltip, slight scale 1.1
- On click: Show "View all team members" modal

Filters section:
- "Filters" heading 14px 600 weight
- Checkboxes with counts:
  * ☑ High priority (5)
  * ☐ Critical (1)
  * ☑ Breached (3)
  * ☐ Paused (2)
  * ☐ Outside calendar (0)
- Checkbox styling: 16px square, border 1px #D1D5DB, checked = blue background with checkmark
- Label: 14px, clickable

Sort section:
- "Sort by" dropdown (default "Updated")
- Options: Updated, Priority, Age, Response time
- Dropdown styling: 6px border-radius, border #D1D5DB

Bottom:
- Settings link (tertiary)
- Sign out link (tertiary, red hover)
- Sidebar width: 240px
- Padding: 16px
- Border right: 1px #E5E7EB

Mobile: Hidden by default, shown in slide-out drawer on hamburger click
```

---

## Prompt 9: Modal: Ticket Details Drawer

```
Create a right-side drawer modal (opens on ticket row click):
- Width: 400px (desktop) or full width -16px (mobile)
- Slide in from right, overlay background 40% #000000
- Header:
  * Close button (X) top-right
  * Ticket key "DC-844" large 24px 600 weight
- Content sections:
  * Status: Badge (Open, In Progress, Resolved) with color
  * Priority: Badge colored by priority
  * Assignee: Avatar 48px + name, link to assignee details
  * Current SLA:
    - First response: "3h 45m overdue" red, meter bar 180%
    - Resolution: "24h remaining" green, meter bar 60%
  * Timeline: Last 3 updates (created, commented, status changed) with timestamps
  * Links: "View in Jira" button, "View chat history" button
- Footer: "Refresh" button, timestamp "Updated 2m ago"
- Animation: Slide-in 300ms ease-in-out
```

---

## Prompt 10: Dashboard Summary Metrics

```
Create a 4-column metric row (top of dashboard):
- Each metric is a card:
  * Width: 200px (responsive: 25% on desktop, 50% on tablet, 100% on mobile)
  * Height: 100px
  * Border-radius: 8px
  * Border: 1px #E5E7EB
  * Padding: 16px

Metric cards:
1. Open tickets: Large "26" in primary text, "open" label small text, icon inbox
2. Due now: Large "5" in red (#EF4444), "breached" label, icon alert
3. Avg response: Large "4h 20m" in primary text, "this month" label, icon clock
4. Team load: Large "3.2" in primary text, "avg per person" label, icon people

- Animation on load: Stagger fade-in 100ms each
- Hover: Slight shadow increase, cursor default (read-only)
- Dark mode: Borders #374151, background #1F2937
```

---

## Implementation Notes

1. All colors reference `docs/design-system-dashboard.md`
2. Ensure 12-column responsive grid for main content
3. Use provided spacing scale (xs=4px, sm=8px, md=16px, lg=24px, xl=32px)
4. All text is translatable (Mongolian/English)
5. Dark mode: Apply `prefers-color-scheme: dark` CSS or manual toggle
6. Prototype interactions: Click ticket row → open drawer; click avatar → filter by person; type in search → show results
7. Test at 320px (mobile), 768px (tablet), 1440px (desktop) breakpoints
