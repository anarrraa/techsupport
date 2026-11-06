# Figma Implementation Prompts: Monthly Report Dashboard

**Purpose**: Replace manual PDF/Excel monthly support reports with an automated, responsive dashboard. Reports generate daily snapshots; users export or view a monthly summary at month-end.

---

## Prompt 1: Monthly Report Header & Export

```
Create a monthly report header spanning full width:

Title section (top):
- Month/year selector: Dropdown "September 2026" with calendar picker
- System/project selector: Buttons for "GP System", "DC System", "Other Systems", "All"
- Active button: Blue background, white text
- Inactive buttons: Gray border, gray text

Right side actions:
- "Generate PDF" button (blue primary, icon + text)
- "Export to Excel" button (secondary, icon + text)
- "Print" button (tertiary, icon only)
- "Share" button (tertiary, icon only)

Timestamp:
- "Report generated: Oct 19, 2026 at 14:32" in small gray text below title

Responsive:
- Desktop: All buttons visible in one row
- Tablet: Stack PDF/Excel buttons below, others side-by-side
- Mobile: Hamburger menu for actions, month/system selectors stack

Layout:
- Height: 80px including spacing
- Padding: 24px
- Border-bottom: 1px #E5E7EB
- Background: White (light) / #111827 (dark)
```

---

## Prompt 2: Executive Summary Metrics

```
Create a 4-column metric summary row (top of report):

Metric 1: Total Tickets Handled
- Large number: "147" (24px 600 weight, blue)
- Label: "tickets" (14px secondary)
- Subtext: "↑ +12 from last month" (12px green)
- Icon: Inbox (24px)
- Card: 1px border #E5E7EB, 8px radius, 16px padding

Metric 2: SLA Compliance
- Large number: "94.2%" (24px 600 weight, green if >90%, amber if 80-90%, red if <80%)
- Label: "compliance" (14px secondary)
- Subtext: "↓ -2.1% from last month" (12px amber)
- Icon: Checkmark circle (24px)
- Visual: Progress bar below number (filled %, color coded)

Metric 3: Average Response Time
- Large number: "2h 18m" (24px 600 weight)
- Label: "first response" (14px secondary)
- Subtext: "↓ Improved from 2h 45m" (12px green)
- Icon: Clock (24px)
- Card: Same styling

Metric 4: Team Utilization
- Large number: "6.2" (24px 600 weight)
- Label: "tickets per person" (14px secondary)
- Subtext: "2-8 range (healthy)" (12px green)
- Icon: People (24px)
- Bar chart showing distribution below (3-4 bars representing team members)

All metrics:
- Responsive: 1 column mobile, 2 columns tablet, 4 columns desktop
- Gap: 16px between cards
- Padding: 24px
- Background: Light gray (#F9FAFB)
```

---

## Prompt 3: SLA Performance by Priority

```
Create a 2x2 grid showing SLA metrics by priority:

Grid layout (4 cards):

Card 1: Critical
- Heading: "Critical" 16px 600 weight, red text
- Stats:
  * "15 tickets" (18px)
  * "Avg response: 45m" (14px secondary)
  * "SLA compliance: 100%" (14px, green)
- Trend: "↑ 3 more than last month" (12px secondary)
- Color accent: Red left border 4px

Card 2: High
- Heading: "High" 16px 600 weight, orange text
- Stats:
  * "42 tickets" (18px)
  * "Avg response: 2h 15m" (14px secondary)
  * "SLA compliance: 96.4%" (14px, green)
- Trend: "↓ 2 fewer than last month" (12px secondary)
- Color accent: Orange left border 4px

Card 3: Medium
- Heading: "Medium" 16px 600 weight, yellow text
- Stats:
  * "68 tickets" (18px)
  * "Avg response: 4h 30m" (14px secondary)
  * "SLA compliance: 89.7%" (14px, amber)
- Trend: "↑ Same as last month" (12px secondary)
- Color accent: Yellow left border 4px

Card 4: Low
- Heading: "Low" 16px 600 weight, purple text
- Stats:
  * "22 tickets" (18px)
  * "Avg response: 8h 15m" (14px secondary)
  * "SLA compliance: 91.3%" (14px, green)
- Trend: "↑ 1 more than last month" (12px secondary)
- Color accent: Purple left border 4px

Each card:
- Border: 1px #E5E7EB
- Border-radius: 8px
- Padding: 16px
- Hover: Slight shadow increase
- Responsive: Stack to 1 column mobile, 2 columns tablet, 4 columns desktop
```

---

## Prompt 4: Team Member Performance Table

```
Create a detailed table showing each team member's monthly stats:

Table structure (scrollable on mobile):
- Columns: Rank | Name | Tickets Handled | Avg Response | Breaches | Compliance | Avg Rating
- 8 rows of data

Column details:

Rank: Left-aligned, 1-8 in secondary text color (no sorting needed, just row numbers)

Name: Left-aligned, 16px 600 weight
- Example: "Uyanga" with optional avatar 32px circle left-side
- Clickable: Link to person's detail view

Tickets Handled: Center-aligned, 18px
- Example: "28"
- Subtext: "avg 4.2/day" (12px secondary)

Avg Response: Center-aligned, 14px
- Example: "2h 18m"
- Color: Green if <4h, amber if 4-6h, red if >6h
- Subtext: "↓ -15m vs last month" or "↑ +12m vs last month" (12px)

Breaches: Center-aligned, 14px red if >0
- Example: "1" or "0"
- Subtext: "2% of tickets" (12px secondary)
- Hover: Show which tickets breached

Compliance: Center-aligned, 14px
- Example: "98.2%"
- Progress bar: Small 60px bar showing percentage
- Color: Green >95%, amber 85-95%, red <85%

Avg Rating: Center-aligned with stars or number
- Example: "4.7/5" with 4.7 star visualization
- Subtext: "18 ratings" (12px secondary)

Row styling:
- Height: 64px
- Hover: Background #F3F4F6
- Border-bottom: 1px #E5E7EB between rows
- Padding: 12px 16px
- Alternating background: Rows 1,3,5,7 white; rows 2,4,6,8 #F9FAFB (optional, subtle)

Header row:
- Background: #F3F4F6
- Text: 12px 600 weight, secondary text
- Sticky: Remains visible on scroll
- Sortable: Click column header to sort (optional v1, add in v2)

Footer:
- "Team average" row with bold values
- Example: "Avg 4.2 tickets/person, 2h 18m response, 95.3% compliance"

Mobile view:
- Stack to cards (one per person)
- Each card shows all columns as key:value pairs
- Swipeable left/right for additional columns
```

---

## Prompt 5: System Comparison (Multi-Project View)

```
Create a comparison view for reports across systems (GP, DC, Other):

Tab/button selector at top:
- "All Systems" (active blue background)
- "GP System" (gray)
- "DC System" (gray)
- "Other Systems" (gray)
- On click: Show filtered data for that system

Comparison table (when "All Systems" is selected):
- Columns: System | Tickets | Avg Response | Breaches | Compliance

Rows:
1. GP System
   - 62 tickets
   - 1h 54m avg response
   - 1 breach
   - 98.4% compliance
   - Bar: Green bar at 98%

2. DC System
   - 67 tickets
   - 2h 42m avg response
   - 3 breaches
   - 95.5% compliance
   - Bar: Green bar at 95%

3. Other Systems
   - 18 tickets
   - 3h 15m avg response
   - 0 breaches
   - 100% compliance
   - Bar: Green bar at 100%

Each row:
- Clickable: View detailed breakdown for that system
- Hover: Highlight row, show "View details" arrow
- Color coding: Compliance % colored (red <85%, amber 85-95%, green >95%)

Responsive:
- Desktop: Full table
- Tablet: Table with scrollable columns
- Mobile: Stacked cards, one per system

Key metrics for each system (if row is expanded):
- Trends vs previous month
- Top 3 team members (mini list)
- Recent breaches (mini list, 2-3 items)
```

---

## Prompt 6: Trends Chart (Month vs Month)

```
Create a 3-month comparison chart:

Title: "Performance Trends" 18px 600 weight

Chart A: Response Time Trend (left side, 50% width)
- Type: Line chart with 3 lines (one per priority)
- X-axis: July, August, September (month names)
- Y-axis: Time in hours (0-12h)
- Series:
  * Critical: Red line, 2px stroke
  * High: Orange line, 2px stroke
  * Medium: Yellow line, 2px stroke
- Values labeled on points: "45m", "2h 15m", "4h 30m"
- Legend: Below chart, horizontal, color-coded
- Grid: Light dashed #E5E7EB

Chart B: SLA Compliance Trend (right side, 50% width)
- Type: Area chart with stacked bars or line
- X-axis: July, August, September
- Y-axis: Percentage (80-100%)
- Single series "Compliance %": Green area
- Values: "92.1%", "93.8%", "94.2%"
- Comparison line: Target "95%" in dashed red
- Legend: Below chart

Both charts:
- Height: 280px each
- Border: 1px #E5E7EB, 8px radius
- Padding: 16px
- Background: White
- On hover: Tooltip showing exact values
- Mobile: Stack vertically, full width

Animation:
- Charts load with fade-in 300ms
- Trend arrows ("↑" green for improving, "↓" red for worsening) next to legend
```

---

## Prompt 7: Top Issues & Blockers

```
Create a section highlighting this month's challenges:

Title: "Notable Issues & Improvements" 18px 600 weight

Two-column layout:

**Column A: Top Blockers** (left, 50%)
- Subheading: "Issues" (red accent 3px left border)
- List of 3-4 items:
  1. "Critical backlog on GP System"
     - Icon: Alert (red)
     - Stat: "5 tickets past SLA" in red
     - Trend: "↑ 2 new this week"
     - Context: "Uyanga's team overwhelmed"
  2. "Long response on Low priority"
     - Icon: Attention
     - Stat: "8h 45m average"
     - Trend: "↑ +1h 30m from last month"
  3. "Two unassigned tickets"
     - Icon: Person-slash
     - Count: "2 critical/high"
     - Action: "Assign to..." button (secondary)

- Each item: Card with 1px border #FCA5A5, background #FEE2E2
- Padding: 12px
- Border-radius: 6px
- Spacing: 8px between items

**Column B: Improvements** (right, 50%)
- Subheading: "Wins" (green accent 3px left border)
- List of 3-4 items:
  1. "Response time improved"
     - Icon: Trending up (green)
     - Stat: "↓ -27m from last month"
     - Team: "Delgertsetseg's team" (clickable)
  2. "Zero breaches on DC System"
     - Icon: Checkmark circle (green)
     - Stat: "100% compliance all month"
     - Team: "5 tickets, 0 breaches"
  3. "New SLA record"
     - Icon: Trophy
     - Stat: "Khulan: 4.8/5 avg rating"
     - Comparison: "Highest in org"

- Each item: Card with 1px border #DCFCE7, background #F0FDF4
- Padding: 12px
- Border-radius: 6px
- Spacing: 8px between items

Responsive:
- Desktop: Side-by-side columns
- Tablet: Stack vertically
- Mobile: Stack with full width
```

---

## Prompt 8: Monthly Activity Timeline

```
Create a timeline showing key events this month:

Title: "Monthly Activity Timeline" 18px 600 weight

Vertical timeline (desktop) or horizontal scrollable (mobile):

Events (chronological, newest at top or bottom per design):

Event 1: Sep 28
- "Khulan set record: 4.8/5 rating"
- Icon: Star (gold)
- Time: "2 days ago"
- Badge: "Achievement"
- Color: Amber/gold accent

Event 2: Sep 22
- "GP System response time improved"
- Icon: Trending up (green)
- Time: "10 days ago"
- Badge: "Improvement"
- Comparison: "↓ -15m from week prior"
- Color: Green accent

Event 3: Sep 15
- "Critical backlog cleared on DC"
- Icon: Checkmark (green)
- Time: "17 days ago"
- Badge: "Milestone"
- Stats: "42 tickets resolved" linked
- Color: Green accent

Event 4: Sep 8
- "Uyanga on-boarded to team"
- Icon: Person plus (blue)
- Time: "24 days ago"
- Badge: "Team change"
- Note: "Now handling support tier 1"
- Color: Blue accent

Event 5: Sep 1
- "Month started"
- Icon: Calendar
- Time: "Month start"
- Badge: "Baseline"
- Stats: "Target: 95% SLA compliance"
- Color: Gray accent

Timeline styling:
- Vertical line down the center (desktop) or horizontal line across (mobile)
- Each event as card offset left/right alternating (desktop) or in row (mobile)
- Icon: 24px, positioned on timeline
- Card: 1px border, 8px radius, 12px padding
- Hover: Shadow increase, card slides slightly
- Responsive: Desktop vertical, tablet horizontal scroll, mobile cards stack

Color coding:
- Achievement: Gold (#F59E0B)
- Improvement: Green (#10B981)
- Milestone: Green (#10B981)
- Team change: Blue (#3B82F6)
- Baseline: Gray (#6B7280)
```

---

## Prompt 9: Export & Download Options

```
Create an export modal/sidebar (triggered by "Export to Excel" or "Generate PDF" button):

Modal structure:
- Title: "Export Monthly Report" (20px 600 weight)
- Subtitle: "Choose what to include and format" (14px secondary)
- Close button (X) top-right

Options checklist (scrollable):
- ☑ Executive summary (metrics cards)
- ☑ Team performance table
- ☑ SLA by priority breakdown
- ☑ Trends charts (3-month)
- ☑ System comparison
- ☑ Notable issues & wins
- ☐ Timeline (optional, skip if taking up space)
- ☐ Detailed ticket list (all 147 tickets with columns)
- ☑ Footer with report metadata

Format selector (radio buttons):
- ◉ PDF (color, formatted, print-ready)
- ○ Excel (editable, charts as images)
- ○ CSV (data only, no formatting)

PDF options (if PDF selected):
- ☑ Include cover page with logo/title
- ☑ Page numbers and "Report - September 2026"
- ☑ Color charts
- ☑ Print-optimized (no background colors)

Excel options (if Excel selected):
- ☑ Each section as separate sheet
- ☑ Summary sheet first
- ☑ Charts embedded
- ☑ Locked cells (formulas protected)

Recipient (optional):
- "Email to:" dropdown (select team members or distribution list)
- Message: "Include in email" textarea (optional)
- "Email on export" checkbox

Buttons (bottom):
- Cancel (secondary)
- Export (primary blue, icon + text)

Modal styling:
- Width: 500px (desktop), 90% (mobile)
- Background: White, border 1px #E5E7EB
- Border-radius: 8px
- Padding: 24px
- Overlay: 40% #000000

Animation:
- Slide up from bottom or fade in 200ms
- Close: Fade out 150ms
```

---

## Prompt 10: Report Footer & Metadata

```
Create a footer section at the end of the report (visible on page and in PDF export):

Footer layout:
- Full width, background #F9FAFB, border-top 1px #E5E7EB
- Padding: 24px
- Max-width: 1200px, centered

Content sections (stack vertically):

Section 1: Report Info
- "Report: September 2026 Support Summary"
- "Generated: October 19, 2026 at 14:32 UTC"
- "Period: September 1-30, 2026"
- "Systems included: GP, DC, Other"
- Text: 12px secondary

Section 2: Definitions (small, subtle)
- "SLA Compliance: % of tickets meeting first response SLA"
- "Avg Response: Average time to first response (working hours)"
- "Tickets: All tickets including paused and completed"
- Text: 11px secondary, light gray

Section 3: Contact & Actions
- "Questions? Contact ops-team@zerotech.mn"
- Links: "View live dashboard" | "Previous month" | "Next month"
- Text: 12px, link color blue

Section 4: Export metadata (PDF only)
- "This PDF was generated from the Tech Success Dashboard"
- "Dashboard URL: https://techsupport.zerotech.mn/reports"
- "Data source: Jira Service Management (JSM)"
- Text: 10px secondary

Mobile view:
- Stack all sections vertically
- Padding reduced to 16px
- Font sizes reduced by 1-2px

Dark mode:
- Background: #1F2937
- Text: #F9FAFB
- Border: #374151
- Links: #60A5FA
```

---

## Implementation Notes

**Automation workflow:**
1. Every night at 23:59 UTC, snapshot current month's SLA data
2. Store snapshots in database (ticket key, metrics, timestamp)
3. Dashboard queries snapshots on-demand
4. Month-end: Pre-generate PDF/Excel and email to team leads

**Data sources:**
- Jira JSM for ticket/SLA data (live or snapshot)
- Escalation state cache for team metrics
- Historical snapshots for trends

**Responsive behavior:**
- Desktop (>1024px): Full layout, all charts visible, side-by-side columns
- Tablet (768-1024px): Stack some sections, charts 100% width
- Mobile (<768px): Full-width cards, charts become tall bars, no table (switch to cards)

**Internationalization:**
- All labels in Mongolian (Cyrillic) and English
- Dates: ISO format or localized per user preference
- Currency/numbers: Mongolian locale (commas for thousands, Mongolian formats)

**Print & export:**
- PDF: Use professional font (Arial/Times), no bright backgrounds unless data
- Excel: Cell formatting matches dashboard colors, formulas for team averages
- CSV: Flat structure, one row per metric/person

**Performance:**
- Lazy-load charts (animate on scroll into view)
- Paginate large tables (20 rows per page)
- Cache month data client-side (localStorage) for instant reload

**Accessibility:**
- All charts have data tables as fallback
- Color not the only indicator (use text labels, icons, patterns)
- Contrast: All text meets WCAG AA
- Focus states: Visible 2px outline on all interactive elements
