# Form and design controls

Open an event and use these controls, then click **Save**.

- **Form:** Select a question to change its type. The question keeps its ID and existing answers; review choices and conditional rules after switching. Add a photo and description, then choose above the question, before the answer, or under the answer. Set photo width and text alignment.
- **Policies:** Choose **Consent checkbox only** for a single acknowledgement at the end of the form. Edit its wording and enable required acknowledgement. The accepted wording and time are stored with the registration. Existing policy sections are preserved if you switch back.
- **Page Design:** Edit the display title independently from the event name. Select words, choose a color and click **Apply color**. Use **Line break** for an intentional new line, or select a phrase and use **Keep words together**. The same visual editor is available for question labels, descriptions, headings, intro, footer and submit wording. Keep phrases short enough to fit a mobile screen.
- **Theme:** Choose Sarabun for Thai text; set page, heading, question, instruction, input and button colors. Move the decorative gradient line to any card edge, adjust its colors/direction/thickness, or hide it. Adjust heading size and line spacing in Page Design.
- **Email:** Open the email design controls to move the header above or below the banner, below the message, or hide it. Set alignment, spacing, logo size, font and colors. Sarabun is requested where the recipient's email app supports web fonts; other apps use Arial or their available fallback.
- **Google Sheets:** Save one spreadsheet link per event. A new registration adds a row. Click **Refresh Google Sheet** to import missed rows or update changed records. The separate setup guide explains the one-time Google Apps Script update.

The editor's Preview shows unsaved form and page changes. Email preview uses the same generated renderer as the Google relay; update the relay when deploying this release.

## More question types and step-by-step instructions (October 2026)

New in **Form Builder → Add**:

- **Yes / No buttons**: large side-by-side answer buttons. The choices are editable, for example Yes, No, Not yet.
- **Picture choice**: each option has its own picture, such as stall types or menu items.
- **Slider (0 to 10)**: choose the range, step and the labels at each end.
- **Date and time**, and **Website link** (must start with https://).
- **Agreement checkbox**: one tick box such as "I agree to the market rules". When Required is on, the form cannot be sent until it is ticked.
- **Instruction box (text and image)**: a coloured box (blue, green, amber or grey) with formatted text and an optional picture.

Show something only after a chosen answer:

1. Add the question, for example a Yes / No question "Have you paid the deposit?" with Yes and Not yet.
2. Below it, add an Instruction box (or any question).
3. In its settings, under **Conditional logic**, choose the question, **equals**, and pick **Not yet** from the list.

The box or question then appears only for that answer. Anything that depends on a hidden question is hidden too, and hidden questions never stop the form being sent.
