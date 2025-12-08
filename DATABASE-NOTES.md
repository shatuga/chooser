# Chooser Database Design Documentation

This document outlines the database schema for the Chooser app, including design decisions and rationale.

## Overview

The Chooser app uses Cloudflare D1 (SQLite) for data persistence. Each version (v1, v2, etc.) has its own isolated database to support the versioned architecture.

## Core Design Principles

1. **No Authentication Required**: Users can create and participate without accounts
2. **Admin via Secret URL**: Admin access is granted through a secret token in the URL
3. **Template Snapshots**: Templates are copied to instances, allowing template evolution without breaking existing choosers
4. **Flexible Selection Labels**: Each instance can have custom selection values (not just yes/no)
5. **Automatic Cleanup**: Unused instances are automatically deleted to manage storage

## Database Schema

### Table: `chooser_templates`

Pre-defined template configurations that define different chooser types.

```sql
CREATE TABLE chooser_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  template_data TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Columns:**
- `id`: Internal identifier
- `slug`: URL-friendly identifier (e.g., "weekly_time", "monthly_date", "potluck")
- `name`: Human-readable name (e.g., "Weekly Time Selector")
- `description`: Explanation of what this template is for
- `template_data`: JSON blob containing template configuration
- `created_at`: Timestamp of template creation

**Design Decisions:**

**Q: Why store templates in the database instead of hardcoding them?**
- Allows updating templates without code deployments
- Future: could enable admin UI for managing templates
- Easier to add new template types

**Q: Why no `is_system` flag for user-created templates?**
- Users can't create custom templates yet (no login system)
- Will add when login/accounts are implemented
- Keeps schema simpler for v1

**Example Template Data:**
```json
{
  "type": "weekly_time",
  "defaultOptions": [
    {"day": "Monday", "times": ["12:00 PM", "1:00 PM"]},
    {"day": "Tuesday", "times": ["12:00 PM", "1:00 PM"]}
  ],
  "allowCustomOptions": true,
  "uiHints": {
    "groupBy": "day",
    "displayFormat": "grid"
  }
}
```

---

### Table: `chooser_instances`

Individual chooser sessions created by users.

```sql
CREATE TABLE chooser_instances (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  template_data TEXT NOT NULL,
  selection_labels TEXT NOT NULL,
  published INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Columns:**
- `id`: Public instance identifier (e.g., "abc123") - shown in participant URLs
- `admin_id`: Secret admin token (e.g., "xyz789-secret") - grants admin access
- `title`: User-provided title (e.g., "Team Lunch Planning")
- `description`: Optional description
- `template_data`: **Snapshot** of template JSON at instance creation time
- `selection_labels`: JSON array of selection values (e.g., ["no", "ok", "ideal"])
- `published`: 0 = draft/unpublished, 1 = published and visible
- `created_at`: When instance was created
- `updated_at`: Last modification timestamp
- `viewed_at`: Last time anyone (admin or participant) viewed this instance

**Design Decisions:**

**Q: Why use TEXT for `id` instead of INTEGER?**
- Allows generating short, URL-friendly IDs (e.g., "abc123")
- More user-friendly than numeric IDs in URLs
- Can use cryptographically random strings

**Q: Why store `template_data` as a snapshot instead of referencing the template?**
- **Key decision**: Allows templates to evolve without breaking existing instances
- If a user creates a chooser with "Weekly Time" template, their instance keeps working even if we update the template
- Trade-off: Uses more storage, but provides stability and immutability
- Users expect their created choosers to keep working exactly as created

**Q: Why custom `selection_labels` per instance?**
- Different use cases need different labels:
  - Scheduling: "no", "ok", "ideal"
  - Potluck: "not bringing", "maybe", "bringing"
  - Voting: "against", "neutral", "for"
- Default: ["no", "ok", "ideal"]
- Users can customize when creating instance

**Q: Why both `published` flag and timestamps?**
- `published = 0`: Draft state, not visible to participants
- Allows admins to set up chooser before sharing
- Unpublished instances auto-delete after 24 hours (prevents abandoned drafts)
- `viewed_at`: Tracks activity for inactive cleanup (180 days)

**Q: Why separate `admin_id` from `id`?**
- **Security**: Public instance ID doesn't grant admin access
- Participant URL: `/a/v1/{id}`
- Admin URL: `/a/v1/admin/{id}/{admin_id}`
- Losing admin URL means losing admin access permanently (acceptable trade-off for no-login simplicity)

---

### Table: `chooser_options`

Available choices for each chooser instance.

```sql
CREATE TABLE chooser_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chooser_id TEXT NOT NULL,
  option_value TEXT NOT NULL,
  option_order INTEGER NOT NULL,
  metadata TEXT,
  FOREIGN KEY (chooser_id) REFERENCES chooser_instances(id) ON DELETE CASCADE
);

CREATE INDEX idx_options_chooser ON chooser_options(chooser_id);
```

**Columns:**
- `id`: Unique option identifier
- `chooser_id`: Which chooser instance this option belongs to
- `option_value`: The actual option text (e.g., "Monday 12:00 PM", "Bring Salad")
- `option_order`: Display order (allows manual reordering)
- `metadata`: JSON for additional data (dates, times, categories, etc.)

**Design Decisions:**

**Q: Why separate table for options instead of JSON array in `chooser_instances`?**
- Easier to query and update individual options
- Supports foreign key relationships with selections
- Better performance for large option lists
- Allows atomic updates to individual options

**Q: Why include `option_order`?**
- Users may want to reorder options
- Natural insertion order may not be desired display order
- Explicit ordering is more reliable than `ROWID` or `created_at`

**Q: What goes in `metadata`?**
- Template-specific data that doesn't fit in `option_value`
- Examples:
  - Time slots: `{"date": "2024-12-05", "time": "14:00"}`
  - Potluck: `{"category": "dessert"}`
  - Dates: `{"month": 12, "day": 5, "year": 2024}`
- Allows rich filtering/sorting in UI without parsing `option_value`

**Q: Why CASCADE delete?**
- When a chooser instance is deleted, all its options should be deleted
- Prevents orphaned options
- Simplifies cleanup logic

---

### Table: `participant_selections`

Participant responses for each option.

```sql
CREATE TABLE participant_selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chooser_id TEXT NOT NULL,
  option_id INTEGER NOT NULL,
  participant_name TEXT NOT NULL,
  selection_value TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chooser_id) REFERENCES chooser_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES chooser_options(id) ON DELETE CASCADE
);

CREATE INDEX idx_selections_chooser ON participant_selections(chooser_id);
CREATE UNIQUE INDEX idx_unique_participant_option
  ON participant_selections(chooser_id, option_id, participant_name);
```

**Columns:**
- `id`: Unique selection identifier
- `chooser_id`: Which chooser instance
- `option_id`: Which option was selected
- `participant_name`: Display name of participant
- `selection_value`: The selection label (e.g., "no", "ok", "ideal")
- `created_at`: When participant first made this selection
- `updated_at`: When participant last changed this selection

**Design Decisions:**

**Q: Why `participant_name` instead of a user ID?**
- **No login system** in v1
- Participants just enter a name when responding
- Name must be unique per chooser instance (enforced by unique index)
- Simple and friction-free for participants

**Q: Why the unique constraint on `(chooser_id, option_id, participant_name)`?**
- Prevents duplicate selections: one response per person per option
- Example: "Alice" can only select "ok" OR "ideal" for "Monday 12pm", not both
- Allows updating selection by replacing the row

**Q: Why denormalize `chooser_id` when we have `option_id`?**
- **Performance**: Faster queries filtering by chooser
- Don't need to join through options table to find all selections for a chooser
- Supports common query: "Get all selections for this chooser"
- Trade-off: Small storage increase for better query performance

**Q: Why allow updating selections?**
- Participants may change their mind
- `updated_at` tracks when last changed
- Admin UI can show "Alice changed from 'ok' to 'ideal' 2 hours ago"

---

## Data Retention & Cleanup

### Automatic Deletion Rules

Implemented via Cloudflare Worker cron job (scheduled task):

**1. Unpublished Instance Cleanup (24 hours)**
```sql
DELETE FROM chooser_instances
WHERE published = 0
  AND created_at < datetime('now', '-24 hours');
```

**Rationale:**
- Users may create drafts and abandon them
- Prevents database clutter from abandoned sessions
- 24 hours gives reasonable time to set up and publish
- Published instances are safe from this cleanup

**2. Inactive Instance Cleanup (180 days)**
```sql
DELETE FROM chooser_instances
WHERE viewed_at < datetime('now', '-180 days');
```

**Rationale:**
- Choosers are typically time-sensitive (events, meetings, etc.)
- 180 days (~6 months) is generous for most use cases
- `viewed_at` updates on ANY view (admin or participant)
- Active choosers are automatically preserved
- Prevents indefinite storage growth

**Cleanup Considerations:**
- Both cleanups use `ON DELETE CASCADE` to remove related data
- Deleting a chooser instance automatically deletes:
  - All options (`chooser_options`)
  - All participant selections (`participant_selections`)
- No orphaned data possible

---

## Indexes

### Query Patterns & Performance

**`idx_options_chooser`** on `chooser_options(chooser_id)`
- Query: "Get all options for chooser X"
- Frequency: Every time a chooser is loaded
- Critical for performance

**`idx_selections_chooser`** on `participant_selections(chooser_id)`
- Query: "Get all selections for chooser X"
- Frequency: Every time results are displayed
- Critical for performance

**`idx_unique_participant_option`** on `participant_selections(chooser_id, option_id, participant_name)`
- Enforces: One selection per participant per option
- Bonus: Speeds up selection updates (upsert pattern)
- Composite index supports partial queries

---

## Future Enhancements

### Potential Schema Changes for v2+

1. **User Accounts & Authentication**
   - Add `users` table
   - Link `chooser_instances.creator_id` to users
   - Add `is_system` flag back to `chooser_templates`
   - Allow users to save custom templates

2. **Comments & Discussion**
   - Add `chooser_comments` table
   - Link to instances and participants

3. **Access Control**
   - Add `chooser_access` table for password-protected instances
   - Add `allowed_domains` for restricting participants

4. **Analytics**
   - Add `chooser_views` table for detailed analytics
   - Track participant engagement

5. **Notifications**
   - Add `notification_settings` for admins
   - Email/webhook when selections change

---

## Versioning Strategy

Each major version (v1, v2, etc.) gets its own D1 database:
- `CHOOSER_DB_V1` → `chooser_v1`
- `CHOOSER_DB_V2` → `chooser_v2`

**Why separate databases per version?**
- No migration pain when releasing new versions
- Old versions keep working indefinitely
- Can iterate on schema without breaking production
- Users on v1 are completely isolated from v2 changes

**Trade-offs:**
- More databases to manage
- Can't easily migrate users from v1 to v2
- Storage duplication if users have data in multiple versions

**Acceptable because:**
- Choosers are ephemeral (auto-delete after 180 days)
- Users create new choosers frequently
- No long-term data portability expectations in v1

---

## Security Considerations

### Admin Access
- Admin ID is cryptographically random (not sequential)
- Must be validated server-side for all admin operations
- Never expose admin ID in participant-facing APIs
- Losing admin URL = losing admin access (by design)

### SQL Injection
- Always use parameterized queries
- Never concatenate user input into SQL
- D1 client library handles this automatically

### Data Privacy
- No personal data collected (just display names)
- No email addresses, IP addresses, or tracking
- Automatic deletion ensures data doesn't persist indefinitely
- GDPR-friendly (ephemeral, no tracking)

### Rate Limiting
- Consider adding rate limits to prevent abuse:
  - Instance creation
  - Selection submissions
  - Option creation

---

## Conclusion

This schema balances simplicity (no auth, no accounts) with flexibility (custom labels, template snapshots). The design supports the core use case of creating quick, shareable selection sessions without requiring user accounts or long-term data storage.

Key trade-offs:
- **Simplicity over features**: No auth, no user accounts (for now)
- **Stability over storage**: Template snapshots use more space but ensure consistency
- **Privacy over analytics**: Minimal data collection, aggressive cleanup
- **Isolation over efficiency**: Separate databases per version avoid migration complexity

This foundation can evolve into v2 with user accounts, custom templates, and advanced features while v1 remains stable and simple.
