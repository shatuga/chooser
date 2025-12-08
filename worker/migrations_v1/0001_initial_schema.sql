-- Chooser v1 Initial Schema
-- Created: 2024-12-05
-- See DATABASE-NOTES.md for design decisions and rationale

-- =============================================================================
-- Table: chooser_templates
-- Purpose: Pre-defined template configurations for different chooser types
-- =============================================================================

CREATE TABLE chooser_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  template_data TEXT NOT NULL,  -- JSON blob
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- Table: chooser_instances
-- Purpose: Individual chooser sessions created by users
-- =============================================================================

CREATE TABLE chooser_instances (
  id TEXT PRIMARY KEY,              -- Public instance ID (e.g., "abc123")
  admin_id TEXT NOT NULL UNIQUE,    -- Secret admin token for admin access
  title TEXT NOT NULL,
  description TEXT,
  template_data TEXT NOT NULL,      -- Snapshot of template JSON at creation
  selection_labels TEXT NOT NULL,   -- JSON array: ["no", "ok", "ideal"]
  published INTEGER DEFAULT 0,      -- 0 = draft, 1 = published
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- Table: chooser_options
-- Purpose: Available choices for each chooser instance
-- =============================================================================

CREATE TABLE chooser_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chooser_id TEXT NOT NULL,
  option_value TEXT NOT NULL,       -- The choice text
  option_order INTEGER NOT NULL,    -- Display order
  metadata TEXT,                    -- JSON for dates/times/etc.
  FOREIGN KEY (chooser_id) REFERENCES chooser_instances(id) ON DELETE CASCADE
);

-- Index for fast lookups of options by chooser
CREATE INDEX idx_options_chooser ON chooser_options(chooser_id);

-- =============================================================================
-- Table: participant_selections
-- Purpose: Participant responses for each option
-- =============================================================================

CREATE TABLE participant_selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chooser_id TEXT NOT NULL,
  option_id INTEGER NOT NULL,
  participant_name TEXT NOT NULL,   -- Display name (must be unique per chooser)
  selection_value TEXT NOT NULL,    -- One of the labels: "no", "ok", "ideal"
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chooser_id) REFERENCES chooser_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES chooser_options(id) ON DELETE CASCADE
);

-- Index for fast lookups of selections by chooser
CREATE INDEX idx_selections_chooser ON participant_selections(chooser_id);

-- Unique constraint: one selection per participant per option
CREATE UNIQUE INDEX idx_unique_participant_option
  ON participant_selections(chooser_id, option_id, participant_name);

-- =============================================================================
-- Seed Data: Default Templates
-- =============================================================================

-- Template: Weekly Time Selector
INSERT INTO chooser_templates (slug, name, description, template_data) VALUES (
  'weekly_time',
  'Weekly Time Selector',
  'Select available times across a week',
  '{
    "type": "weekly_time",
    "instructions": "Click on each of the timeslots below to toggle it from green (ok) to yellow (less preferred) to red (no) to indicate what times you can attend this event during the week.",
    "adminInstructions": "Specify the start time and end time of each day. Click on the day of week to enable or disable it. Specify the time window in minutes. Click on individual timeslots to make them unavailable (greyed out) for your participants.",
    "defaultOptions": [
      {"day": "Monday", "times": ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM"]},
      {"day": "Tuesday", "times": ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM"]},
      {"day": "Wednesday", "times": ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM"]},
      {"day": "Thursday", "times": ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM"]},
      {"day": "Friday", "times": ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM"]}
    ],
    "allowCustomOptions": true,
    "uiHints": {
      "groupBy": "day",
      "displayFormat": "grid"
    }
  }'
);

-- Template: Monthly Date Selector
INSERT INTO chooser_templates (slug, name, description, template_data) VALUES (
  'monthly_date',
  'Monthly Date Selector',
  'Select available dates in a month',
  '{
    "type": "monthly_date",
    "instructions": "Click on each date to toggle it from green (ok) to yellow (less preferred) to red (no) to indicate which dates work for you.",
    "adminInstructions": "Select the dates you want participants to choose from. You can click individual dates or click and drag to select a range. Remove dates by clicking them again.",
    "defaultOptions": [],
    "allowCustomOptions": true,
    "uiHints": {
      "displayFormat": "calendar",
      "allowDateRange": false
    }
  }'
);

-- Template: Potluck/Item Selector
INSERT INTO chooser_templates (slug, name, description, template_data) VALUES (
  'potluck',
  'Potluck Contribution Selector',
  'Coordinate who is contributing what, selected from categories you can configure.',
  '{
    "type": "potluck",
    "instructions": "Click on each item to toggle it from green (willing to bring) to yellow (could bring if needed) to red (cannot bring) to indicate what you can contribute to the event.",
    "adminInstructions": "Add categories (like Main Dish, Dessert, Drinks) and then add specific items within each category. Participants will indicate what they can bring.",
    "defaultOptions": [
      {"category": "Main Dish", "suggestions": ["Pasta", "Casserole", "BBQ"]},
      {"category": "Side Dish", "suggestions": ["Salad", "Vegetables", "Rice"]},
      {"category": "Dessert", "suggestions": ["Cake", "Cookies", "Fruit"]},
      {"category": "Drinks", "suggestions": ["Soda", "Juice", "Water"]}
    ],
    "allowCustomOptions": true,
    "uiHints": {
      "groupBy": "category",
      "displayFormat": "list"
    }
  }'
);

-- Template: Simple Poll
INSERT INTO chooser_templates (slug, name, description, template_data) VALUES (
  'simple_poll',
  'Simple Poll',
  'Quick poll to see who prefers what among a set of options.',
  '{
    "type": "simple_poll",
    "instructions": "Click on each option to toggle it from green (yes) to yellow (maybe) to red (no) to indicate your preference.",
    "adminInstructions": "Add the options you want participants to vote on. Each option will be a separate choice in your poll.",
    "defaultOptions": [],
    "allowCustomOptions": true,
    "uiHints": {
      "displayFormat": "list",
      "showResults": true
    }
  }'
);
