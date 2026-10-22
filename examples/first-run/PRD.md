# Project Specification (PRD) — Shopping list

A throwaway project for proving the circon loop end to end. Small on purpose:
every task is something a 7B editor model should finish in one iteration.

## Objective

A shared shopping list: add an item, see the list, from the phone or the web.

## Scope

- For one household, no accounts. Out of scope: sign-in, sharing, sync
  conflicts, editing or deleting items.

## How to build it

Engineering standards live in `~/AI-Workspace/conventions/ARCHITECTURE.md` and
are loaded into every session automatically. This file says what to build.

## Design Principles

- **One screen.** Everything happens on the list screen; no navigation, no
  modals. If a feature needs a second screen it is out of scope.
- **The input is always ready.** The "New item" field is at the top and keeps
  focus after adding, so adding five items is five type-and-enter actions.
- **Errors stay inline.** A failed request shows a one-line message above the
  list with a retry; the list itself never disappears because of an error.
- **Plain over pretty.** Default design-system components, no custom styling
  beyond spacing.

## User Flows

    Add an item
      1. Open the app -> list screen          [states: loading, empty, error]
      2. Type into "New item", press "Add item"
      3. The item appears at the top          [states: saving, failed to save]

    Empty list
      1. Open the app with no items -> "No items yet"

## Task Backlog
- [ ] Replace the starter screen in apps/mobile with a "Shopping list" screen: a heading "Shopping list", a text field labelled "New item" and a button labelled "Add item". Keep items in component state for now.
- [ ] Add GET /items and POST /items to services/api with an in-memory store, validating that a name is 1-80 characters. Put the request and response types in packages/shared.
- [ ] Load and add items through the API from the mobile screen, rendering loading, error (with a "Retry" button) and empty ("No items yet") states.
- [ ] Move every visible string into packages/i18n with English and German translations.
- [ ] Add a unit test for the POST /items input validation in services/api.
