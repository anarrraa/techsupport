# Design System: Tech Success Dashboard + Admin Chat

## Color Palette

### Semantic colors
- **Breached**: `#EF4444` (red) — SLA overdue
- **Warning**: `#F59E0B` (amber) — approaching breach
- **Healthy**: `#10B981` (emerald) — within SLA
- **Neutral**: `#6B7280` (gray) — paused, not applicable
- **Background**: `#FFFFFF` (light) / `#111827` (dark)
- **Surface**: `#F9FAFB` (light) / `#1F2937` (dark)
- **Text Primary**: `#111827` (light) / `#F9FAFB` (dark)
- **Text Secondary**: `#6B7280` (light) / `#9CA3AF` (dark)
- **Border**: `#E5E7EB` (light) / `#374151` (dark)

### Priority colors
- **Critical**: `#DC2626` (red)
- **High**: `#EA580C` (orange)
- **Medium**: `#EAB308` (yellow)
- **Low**: `#8B5CF6` (purple)

## Typography

- **Headings (H1)**: 32px / 40px line-height, 600 weight, primary text
- **Headings (H2)**: 24px / 32px line-height, 600 weight, primary text
- **Headings (H3)**: 18px / 28px line-height, 600 weight, primary text
- **Body Large**: 16px / 24px line-height, 400 weight, primary text
- **Body**: 14px / 20px line-height, 400 weight, secondary text
- **Small**: 12px / 16px line-height, 400 weight, secondary text
- **Code**: Monospace 12px / 16px, `#1F2937` (light) / `#E5E7EB` (dark)

### Font family
- Sans-serif: System font stack or `Inter`, `Segoe UI`, `Roboto`
- Mono: `Courier New`, `Menlo`, `Monaco`

## Spacing

- **xs**: 4px
- **sm**: 8px
- **md**: 16px
- **lg**: 24px
- **xl**: 32px
- **2xl**: 48px

## Border radius

- **sm**: 4px (small buttons, chips)
- **md**: 8px (cards, inputs)
- **lg**: 12px (modals, large cards)

## Components

### Card
- Border radius: 8px
- Border: 1px solid `#E5E7EB` (light) / `#374151` (dark)
- Padding: 16px
- Background: white (light) / `#1F2937` (dark)
- Shadow: 0 1px 3px rgba(0,0,0,0.1)

### Button
- **Primary**: Background `#3B82F6`, text white, 8px padding, 6px border-radius
- **Secondary**: Border 1px `#D1D5DB`, text primary, 8px padding, 6px border-radius
- **Tertiary**: No border, text primary, hover background `#F3F4F6`, 8px padding
- **Danger**: Background `#EF4444`, text white, 8px padding, 6px border-radius
- Hover: 10% darker or lighter depending on mode
- Disabled: 50% opacity

### Input / Textarea
- Border: 1px solid `#D1D5DB` (light) / `#4B5563` (dark)
- Border radius: 6px
- Padding: 8px 12px
- Focus: Border color `#3B82F6`, shadow `0 0 0 3px rgba(59, 130, 246, 0.1)`

### Chip / Badge
- Background: Priority color (medium opacity)
- Text: Priority color (darker)
- Border radius: 4px
- Padding: 4px 8px
- Font size: 12px

### Status Indicator
- Circle 8px diameter, inline
- Color: Semantic color (breached/warning/healthy/neutral)
- Filled solid

### Table Row (Ticket List)
- Height: 56px min
- Hover: Background `#F3F4F6` (light) / `#1F2937` (dark)
- Border bottom: 1px `#E5E7EB` (light) / `#374151` (dark)
- Cells padded 12px

### Trend Chart
- Line chart or bar chart
- Line stroke: 2px
- Axis labels: 12px, secondary text
- Grid: `#E5E7EB` (light) / `#374151` (dark), 1px, dashed
- Tooltip: Card with shadow, primary text, dark background

### Avatar / Assignee Pill
- Circle or rounded square 32px
- Initials or photo
- Background: Avatar color (unique per person)
- Hover: Slight scale 1.05, shadow

## Layout

### Dashboard
- Sidebar: 240px fixed (team members, filters) or collapsible
- Main content: Full width - sidebar width, max 1400px
- Header: 64px height, contains title and search
- Spacing: 24px padding on main sections

### Admin Chat
- Sidebar or left panel: 300px (chat history, recent queries)
- Message list: Full width - sidebar, scrollable
- Input area: Fixed bottom, 60px height, message input + send button
- Message bubbles: Max 80% width, left or right aligned

### Card Grid
- Responsive: 1 column (mobile), 2 columns (tablet), 3 columns (desktop)
- Gap: 16px between cards

## Responsive Breakpoints

- **Mobile**: < 640px
- **Tablet**: 640px – 1024px
- **Desktop**: > 1024px

On mobile:
- Sidebar hidden (hamburger menu)
- Cards stack to 1 column
- Font sizes reduced by 1 step
- Padding reduced to 12px

## Dark mode

All colors specified above include light and dark variants. Use `prefers-color-scheme: dark` media query or a manual theme toggle.

## Accessibility

- **Contrast**: All text meets WCAG AA (4.5:1 for normal text, 3:1 for large text)
- **Focus states**: Visible 2px outline or shadow, never removed
- **Interactive elements**: Minimum 44px target size
- **Labels**: All inputs have associated `<label>` or `aria-label`
- **Status indicators**: Never rely on color alone; include text or icon
- **Language**: Support Mongolian (Cyrillic) and English; font families support both

## Motion / Transitions

- **Hover states**: 200ms ease-out
- **Page transitions**: 150ms fade
- **Modal/drawer**: 300ms ease-in-out slide
- **Toast notifications**: 300ms slide-up

## States

### Ticket row states
- **Normal**: Default card styling
- **Breached**: Left border 4px red, background tinted red 5%
- **Warning**: Left border 4px amber, background tinted amber 5%
- **Paused**: Opacity 60%, icon indicator "paused"
- **Hover**: Slight shadow increase, cursor pointer

### Loading states
- Skeleton: `#E5E7EB` (light) / `#374151` (dark) animated pulse
- Spinner: 24px size, primary color, smooth rotation

### Empty states
- Icon: 48px, secondary text color
- Heading: "No data"
- Subheading: Context-specific message, secondary text
- Action: Link or button to populate (if applicable)

### Error states
- Border: 2px solid `#EF4444`
- Icon: Warning icon, red
- Message: White text on red background, padded card

## Internationalization

- **Mongolian**: All UI labels, help text, and errors translated
- **English**: Default fallback; all copy mirrors Mongolian intent
- **Date format**: ISO 8601 or locale-aware (Mongolia: `YYYY.MM.DD`)
- **Time format**: 24-hour for logs, context-aware for user-facing
- **Numbers**: Locale-aware thousands separator
