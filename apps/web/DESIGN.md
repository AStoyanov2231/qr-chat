---
name: QR Chat
description: A warm, local-first visual system for place-based conversation.
colors:
  background: "#fbfaf7"
  ink: "#293d34"
  muted: "#777d75"
  line: "#e6e8df"
  green: "#294f3b"
  lime: "#e8edbd"
  sidebar: "#f1f2eb"
  surface: "#fffefa"
  focus: "#9dab64"
typography:
  display:
    fontFamily: "Geist, sans-serif"
    fontSize: "clamp(52px, 5.5vw, 76px)"
    fontWeight: 450
    lineHeight: 1.1
    letterSpacing: "-2.8px"
  body:
    fontFamily: "Geist, sans-serif"
    fontSize: "14px"
  italic-accent:
    fontFamily: "Georgia, serif"
    fontWeight: 400
rounded:
  control: "7px"
  card: "10px"
  panel: "12px"
  modal: "18px"
spacing:
  compact: "8px"
  control: "15px"
  section: "52px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "#fff"
    rounded: "{rounded.control}"
    padding: "15px 19px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "8px"
    padding: "13px 8px"
---

# Design System: QR Chat

## Overview

QR Chat uses a warm forest-green and cream interface to make local, low-pressure conversation feel calm and human.
Geist provides compact functional text, while Georgia italic highlights a few conversational words in headlines and captions.
Desktop is a marketing-only experience that sends people to their phone through a QR handoff.
Mobile is the local chat application, including the join flow, conversations, and browser-storage feedback.

## Colors

The palette is soft and restrained, with green reserved for the brand, primary actions, and active signals.

- **Cream background** (`#fbfaf7`) is the page foundation.
- **Forest green** (`#294f3b`) anchors the logo mark, primary buttons, QR modules, and sent-message controls.
- **Deep ink** (`#293d34`) carries primary text.
- **Muted sage text** (`#777d75`) supports secondary copy and metadata.
- **Pale lime** (`#e8edbd`) and nearby pale green surfaces distinguish selected, illustrative, and handoff elements.
- **Fine line** (`#e6e8df`) separates sections, controls, and panels.
- **Visible focus green** (`#9dab64`) outlines keyboard-focused links and buttons.

## Typography

Geist is the default sans-serif face for navigation, controls, body copy, metadata, and chat content.
Desktop hero display text scales from `52px` to `76px`, and the mobile hero uses `46px` with tight negative tracking.
The regular display weight is 450 to 500, with compact labels commonly set at 9px to 12px and medium weights around 550.
Georgia italic appears inside emphasized headline phrases and small decorative captions, colored muted olive rather than using a separate headline typeface.

## Layout

The route selects the mobile chat at widths of 767px and below, and selects the desktop landing page at widths above 767px.
The desktop landing is centered at a maximum width of 1200px with 55px side padding, a 106px navigation bar, and large vertically spaced sections.
The desktop hero is a two-column composition with copy beside an illustrated phone preview.
The landing uses three-column grids for the steps and place examples, then collapses its density at narrower desktop widths without becoming the chat app.
The mobile application fills the viewport and keeps the composer at the bottom of the active chat.
Mobile controls expand to 44px where needed, and the composer respects the bottom safe-area inset.

## Elevation & Depth

The interface is mostly flat and relies on cream-tonal surfaces, borders, and generous whitespace for structure.
Small soft shadows lift illustrative chat bubbles, the desktop phone preview, the sticker, the modal, and the toast.
The join dialog darkens and lightly blurs its backdrop to establish the only strong modal layer.

## Shapes

Controls use restrained 6px to 10px rounding, while cards and message bubbles use 10px to 12px corners.
Brand marks and venue icons are rounded squares, avatars and status indicators are circles, and pills use fully rounded 20px or 25px edges.
Message bubbles have one square-adjacent corner to clarify message direction.
The desktop phone preview has a strongly rounded 39px device frame, plus gently rotated labels and stickers for the hand-made illustrative layer.

## Components

### Brand and navigation

The brand pairs a forest-green rounded square QR icon with lowercase Geist wordmark text and a sage dot.
Desktop navigation contains two section links and a bordered phone call to action.
The desktop page is marketing-only and its primary actions lead to the QR handoff section rather than opening chat on desktop.

### Desktop landing and QR handoff

The hero, steps, place examples, and handoff use quiet cream surfaces, fine dividers, and green accents.
The product preview is illustrative and has an explicit accessibility label describing it as a preview of the mobile chat experience.
The QR handoff renders a labeled QR image after its URL is available, while a fixed-size "Preparing your QR code..." placeholder preserves the layout during loading.
The handoff ends with a visible local-preview disclosure that says chats currently stay in each browser and shared conversations are coming next.

### Mobile chat shell

The mobile header contains the brand, a 44px minimum join button, and joined-conversation shortcuts when present.
The active conversation has a venue heading, participant status, information toggle, scrollable `aria-live` message region, and bottom composer.
Own messages reverse alignment and use pale green bubbles, while other messages use soft gray-green bubbles with an avatar and metadata.
An empty conversation offers one starter-message suggestion.

### Join and feedback states

The native dialog supports code entry, display-name entry, invalid, deleted, and closed-code errors, and a demo shortcut.
Buttons dim and become unavailable when disabled, and normal hover feedback slightly reduces brightness.
Storage failures appear as a status message in the dialog or a dismissible toast, explaining that browser storage may be full or disabled.
Message options allow reporting or hiding a participant, and group information allows hidden participants to be restored or the conversation to be left.

### Inputs and focus

Inputs have white fill, pale borders, 7px corners, and green caret color.
Focused inputs gain a green outline, while the composer uses a `:focus-within` outline around its containing field.
Keyboard-focused links and buttons receive a 3px focus-visible outline with a 4px offset.

## Do's and Don'ts

- Do use forest green for the primary action, logo mark, QR modules, and clear active signals.
- Do keep supporting surfaces cream, off-white, and pale sage with thin low-contrast separators.
- Do use Georgia italic sparingly to add warmth to a word or phrase inside a Geist headline.
- Do preserve the desktop QR handoff and the local-preview disclosure when extending desktop marketing screens.
- Do preserve labels, live-message announcements, error semantics, visible focus outlines, and mobile touch target sizing.
- Don't present desktop as an interactive chat client.
- Don't use heavy shadows, high-saturation accents, or dense card grids as the default visual language.
- Don't hide storage failures or imply that chats are shared across devices in the current local preview.
