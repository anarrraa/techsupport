# Figma Implementation Prompts: Admin Chat

Use these prompts to design the Admin Chat interface in Figma.

---

## Prompt 1: Admin Chat Full Page Layout

```
Create an admin chat web page with:

Header (64px):
- Title "Admin Chat" 18px 600 weight
- Subtitle "Ask about tickets, load, or trends" 12px secondary text
- Dark line bottom (#E5E7EB)

Two-column layout:
- Left sidebar 300px (collapsible on mobile):
  * "Recent queries" heading
  * Scrollable list of 8 past chats with timestamps
  * Search input at bottom: placeholder "Find a past chat..."
  * Mobile: Hidden by default, shown in slide drawer

- Right main content area:
  * Message list area (full height minus input)
  * Fixed input area at bottom

Message list:
- Scrollable container, white background
- Padding: 16px
- Border: None
- Line spacing: 16px between message groups

Input area (fixed bottom 60px):
- Background: White, border-top 1px #E5E7EB
- Contains: Textarea + Send button
- Padding: 16px
- Textarea: 44px height, 6px border-radius, 8px padding, border 1px #D1D5DB
- Send button: 44px height, blue background, icon + text "Send"
- Disabled when text is empty

Responsive:
- Desktop 1400px: Full layout with sidebar
- Tablet 768px: Sidebar hidden, hamburger to show
- Mobile 320px: Full width, sidebar drawer
```

---

## Prompt 2: Admin Chat Message Bubble (User Query)

```
Create a user message bubble:

Container:
- Align: Right side of screen
- Max-width: 80%
- Background: Blue (#3B82F6)
- Text color: White
- Padding: 12px 16px
- Border-radius: 8px (left 8px, right 0px for speech bubble effect)
- Margin: 8px 0

Content:
- Main text: 14px, line-height 1.5
- Timestamp: 12px, white at 70% opacity, below message, right-aligned
- Icon (optional): Chat bubble icon left-side, 16px white

Example messages:
1. "What's happening right now?" (short)
2. "Show me all High-priority tickets that are breached" (medium)
3. "Can you tell me why DC-844 wasn't in the reminders? I think it should have been" (long, wraps)

Mobile: Max-width 90%, padding 10px 12px, font 13px
```

---

## Prompt 3: Admin Chat Message Bubble (System Response)

```
Create a system response message bubble:

Container:
- Align: Left side of screen
- Max-width: 85%
- Background: Light gray (#F3F4F6)
- Text color: Primary (#111827)
- Padding: 12px 16px
- Border-radius: 8px (left 0px, right 8px for speech bubble effect)
- Border: 1px #E5E7EB
- Margin: 8px 0

Content structure:
- Optional icon (info/checkmark/alert) 16px left-side
- Main text: 14px, line-height 1.5
- Timestamp: 12px secondary text, below message, left-aligned

Example responses (with different content types):

Response 1: Simple count
"5 tickets are currently due. Here's the breakdown:
• Critical: 1 (DC-844)
• High: 2 (DC-862, DC-863)
• Medium: 2 (DC-864, DC-865)"

Response 2: Decision trace
"DC-844 was skipped because:
✓ It is breached (38m overdue on first response)
✓ It is within calendar hours (09:00-18:00)
✗ It is paused on 'Waiting for customer' status
Paused cycles don't produce reminders. It will resume when moved to In Progress."

Response 3: Person summary
"Uyanga's current load:
• 6 open tickets
• 2 due right now (Critical: 1, High: 1)
• Average response time (this month): 3h 45m"

Response 4: Trend answer
"High-priority response time:
• Last 30 days: 2h 18m average (↓ improved from 2h 45m)
• Last 90 days: 2h 34m average (↑ degraded from 2h 20m)
Recommendation: If this trend continues, you may breach more frequently."

Mobile: Max-width 90%, padding 10px 12px, font 13px
Dark mode: Background #1F2937, text #F9FAFB, border #374151
```

---

## Prompt 4: Admin Chat with Multiple Message Pairs

```
Create a scrollable conversation with 4 message pairs:

Pair 1:
User (right): "What's happening now?"
System (left): "5 tickets are currently due. Here's the breakdown:
• Critical: 1 (DC-844)
• High: 2 (DC-862, DC-863)
• Medium: 2 (DC-864, DC-865)"

Pair 2:
User (right): "Why is DC-844 still due? Didn't we send a reminder?"
System (left): "DC-844 received a reminder 3 hours ago but the SLA has not been met yet. It is now 38 minutes overdue. Current status: Open. Last update: 2 hours ago when you commented on it."

Pair 3:
User (right): "Who's most overloaded right now?"
System (left): "Uyanga is managing the highest load:
• 6 open tickets (2 due now)
• Average response: 3h 45m
Next: Delgertsetseg (5 open, 1 due), Khulan (4 open, 1 due)"

Pair 4:
User (right): "Show me trends for the last 90 days"
System (left): "Response time by priority (90 days):
Critical: 1h 12m avg (↑ +18m slower)
High: 2h 34m avg (↓ -12m faster)
Medium: 4h 20m avg (→ stable)
[Link] View full trend chart"

Layout:
- Spacing: 16px between message groups (user + system)
- Timestamps: "just now", "2m ago", "5m ago", "8m ago"
- Scroll area: Full height minus input area
- Load indicator: "Loading more..." at top on scroll-up

Styling:
- Font: 14px line-height 1.5
- Colors: Follow design system
- Avatars: Optional small avatar (16px) before system message
```

---

## Prompt 5: Admin Chat Input Area

```
Create the chat input area (fixed bottom):

Container:
- Height: 60px
- Background: White, border-top 1px #E5E7EB
- Padding: 12px 16px
- Display: Flex, gap 8px

Textarea:
- Width: Flex-grow (remaining space)
- Height: 44px
- Border: 1px solid #D1D5DB
- Border-radius: 6px
- Padding: 8px 12px
- Font: 14px, line-height 1.5
- Placeholder: "Ask about tickets, load, or trends..."
- Resize: Vertical only (max 120px height before scrolling)
- Focus: Border #3B82F6, shadow 0 0 0 3px rgba(59, 130, 246, 0.1)

Send button:
- Width: 44px
- Height: 44px
- Background: Blue (#3B82F6), white text
- Border-radius: 6px
- Icon: Paper plane or send arrow, 20px centered
- Hover: Background darker (#2563EB)
- Disabled: 50% opacity, cursor not-allowed (when textarea empty)
- Active click: Brief 100ms scale animation

Optional actions (right of send):
- Attachment button (paperclip icon, 16px): Tertiary, opens file picker
- Suggestion chips above input (small): "What's happening", "Show trends", "Who's overloaded"

Keyboard:
- Enter: Send message (focus input, press Enter)
- Shift+Enter: Newline in textarea
- Escape: Clear suggestions panel

Mobile:
- Textarea: Full width, 40px height
- Send: 40px square button, icon only
- Input area total height: 56px
- Suggestion chips: Hidden on mobile
```

---

## Prompt 6: Admin Chat Recent Queries Sidebar

```
Create the left sidebar with recent query history:

Header:
- "Recent queries" heading 14px 600 weight
- Padding: 16px 12px
- Border-bottom: 1px #E5E7EB

Scrollable list:
- Items: 8 past conversations
- Each item 56px height
- Hover: Background #F3F4F6
- Active (selected): Background #E0E7FF (light blue), left border 3px #3B82F6

Item structure:
- Query snippet: "Why is DC-844 skipped?" 14px, truncate, primary text
- Timestamp: "2 hours ago" 12px, secondary text
- Icon (optional): Clock icon 16px left-side

Example items:
1. "What's happening right now?" - just now
2. "Show high-priority tickets" - 15m ago
3. "What's Uyanga's load?" - 1h ago
4. "Why is DC-844 skipped?" - 2h ago
5. "Trends for the last 30 days" - 3h ago
6. "Who's overloaded?" - 5h ago
7. "Can I see DC-863 details?" - 1d ago
8. "What's the team's average response time?" - 2d ago

Bottom section:
- Search input: 12px font, 6px border-radius, 8px padding
- Placeholder: "Find a chat..."
- Border: 1px #D1D5DB
- Padding: 12px

Responsive:
- Desktop: 300px fixed width
- Tablet: Hidden, hamburger button to toggle
- Mobile: Full width -16px slide-drawer

Scrollbar: Thin, #D1D5DB, hover #9CA3AF
Dark mode: Background #1F2937, hover #111827, active border #3B82F6
```

---

## Prompt 7: Admin Chat Empty State

```
Create an empty chat screen (first load):

Center container:
- Max-width: 400px
- Centered on page

Icon:
- Chat bubble icon, 64px, secondary text color (#6B7280)

Heading:
- "Start a conversation" 24px 600 weight
- Color: Primary text

Subheading:
- "Ask about tickets, team load, or SLA trends. Try one of these questions:" 14px secondary text

Suggestion cards (3 columns on desktop, stack on mobile):
Card 1:
- Icon: Eye icon
- Title: "What's happening?"
- Example: "What's happening now?"
- Click action: Fill input and focus

Card 2:
- Icon: Bar chart icon
- Title: "Show trends"
- Example: "How are we trending on High priority?"
- Click action: Fill input and focus

Card 3:
- Icon: People icon
- Title: "Team load"
- Example: "Who's most overloaded?"
- Click action: Fill input and focus

Each card:
- Border: 1px #E5E7EB
- Border-radius: 8px
- Padding: 16px
- Cursor: Pointer
- Hover: Border #3B82F6, shadow increase
- Background: White, hover #F0F4FF

Footer:
- "Need help?" link 12px
- "View documentation" link 12px
- Centered, secondary text color

Mobile: Hide suggestion cards, show just the heading and subheading with an input focus placeholder
```

---

## Prompt 8: Admin Chat Loading State

```
Create a loading state within the message area:

Skeleton loader:
- Placeholder message bubble (left side)
- Background: #E5E7EB animated pulse
- Size: 300px width, 48px height
- Border-radius: 8px
- Animation: 1s loop, opacity 0.5 → 1.0 → 0.5

Text below:
- Centered, 14px secondary text
- "Thinking..." or "Processing your request..."

Typing indicator (optional):
- Three dots in sequence
- Each dot 8px circle, #6B7280
- Animation: dot 1 fade, then dot 2 fade, then dot 3 fade (staggered)
- Cycle: 1.4s loop

Include 2 examples:
1. Simple loading (skeleton only)
2. With typing indicator (dots animating)

Mobile: Same styling, responsive width 90%
Dark mode: Skeleton #374151
```

---

## Prompt 9: Admin Chat Error State

```
Create an error message display:

Error bubble (left side, like system message but red):
- Background: Light red (#FEE2E2)
- Border: 1px solid #FCA5A5
- Text color: Dark red (#991B1B)
- Icon: Alert/exclamation 16px red, left-side
- Padding: 12px 16px
- Border-radius: 8px

Error types (show 2 examples):

Error 1: Jira unreachable
"Unable to connect to Jira. Please check your connection and try again in a moment."
[Retry button]

Error 2: Query timeout
"That query took too long. Try a more specific question (e.g., 'Show High-priority tickets' instead of 'Show all tickets')."
[New query suggestion link]

Button styling (in error):
- Secondary button: Border 1px #FCA5A5, text #991B1B
- Hover: Background #FEE2E2

Retry button:
- "Retry" text, 14px
- On click: Re-submit the same query

Timestamp: "Error at 2:45 PM" 12px secondary text below

Mobile: Full width -32px, center aligned
Dark mode: Background #7F1D1D, border #B91C1C, text #FCA5A5
```

---

## Prompt 10: Admin Chat Suggestion Pills

```
Create inline suggestion pills (appear above input or in empty state):

Pill styling:
- Border: 1px solid #D1D5DB
- Border-radius: 20px (full rounded)
- Padding: 6px 12px
- Font: 12px
- Text color: Primary
- Background: White
- Cursor: Pointer
- Hover: Background #F3F4F6, border #3B82F6

Container:
- Display: Flex, gap 8px, wrap
- Padding: 8px
- Placeholder area: "Quick suggestions" heading

Suggestion examples (show 6 pills):
1. "What's happening?"
2. "Show High-priority"
3. "Who's overloaded?"
4. "Trends last 30 days"
5. "Why was DC-844 skipped?"
6. "Uyanga's load"

On click:
- Fill input with the suggestion text
- Focus the textarea
- Optionally submit automatically

Animation:
- Fade in 200ms when suggestions load
- Brief highlight 100ms on hover
- Click → fade out, input focuses

Mobile: Hide suggestion pills, show only in empty state
Dark mode: Background #1F2937, border #374151, hover background #111827
```

---

## Implementation Notes

1. All colors and typography from `for-agents/design-system-dashboard.md`
2. Messages are fully responsive: stack at mobile, side-by-side at desktop
3. Admin Chat uses the same authentication/session as the Dashboard
4. Typing indicators and loading states are optional nice-to-haves
5. Error messages always include a recoverable action (Retry, New query, etc.)
6. Timestamps are auto-generated on message send (handled by backend)
7. Dark mode support via `prefers-color-scheme: dark` CSS
8. Test at breakpoints: 320px (mobile), 768px (tablet), 1440px (desktop)
9. Ensure text is translatable (Mongolian/English)
10. All interactive elements have visible focus states (outline or shadow)
