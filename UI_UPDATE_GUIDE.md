# Custom colour key and interface update

## Configure an event

1. Open the admin area and select Events.
2. Open your event and choose Floor Plan.
3. Find Custom colour key and press Add colour description.
4. Choose a colour and enter its description. Repeat for each item you need.
5. Press Save at the top of the event editor.
6. Refresh the registration page and check the map and printed map preview.

The previous preset legend is removed. Events without custom entries show no colour key. Remove all entries and save to hide it again. Blank descriptions are not displayed.

The colour key explains the map only. To change an actual booth colour, select the booth in the designer and use its colour control, then Save layout. Booking availability and status rules are unchanged.

## Interface changes

Controls have larger tap targets, clearer keyboard focus and smoother switch movement. Admin navigation has more spacing and a scrollable desktop sidebar. Public cards use softer shadows while retaining event branding. An event loading error now appears instead of being hidden behind the loading screen.

## Verification

The TypeScript check and production build passed. Rendering checks covered missing and empty keys, blank labels, invalid colours and custom labels and swatches. No live registrations were submitted and database saving was not exercised. Browser appearance and mobile interactions still need a live check after deployment.

No database migration is needed. Custom entries are part of the existing floor_plan JSON settings and use the existing event Save action.
