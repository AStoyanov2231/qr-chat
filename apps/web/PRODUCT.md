# QR Chat

A mobile-first web app for joining a temporary conversation through a physical QR code at a venue.
Open a code, enter a display name, create or join the associated group, and chat.
The first visitor creates the group, and several registered codes can resolve to one group.
This MVP uses browser storage only; Supabase and external services are out of scope.
Support remembered names and memberships, text messages, group information, local hiding, reporting, leaving, and helpful invalid/deleted/closed states.
Use the existing Next.js and React app in apps/web.
Phones use the interactive chat app at widths up to 767px.
Desktop is exclusively a landing page that showcases QR Chat and hands off to phones using a real QR link.
