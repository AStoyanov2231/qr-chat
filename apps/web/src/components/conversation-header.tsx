import { ArrowLeft, Browser, GearSix } from '@phosphor-icons/react';

export type VenueLink = { label: string; href: string };

export function ConversationHeader({ title, subtitle, onBack, onSettings, settingsLabel, disabled, venueLinks = [] }: { title: string; subtitle?: string; onBack: () => void; onSettings?: () => void; settingsLabel?: string; disabled?: boolean; venueLinks?: VenueLink[] }) {
  return <header className="chat-bar">
    <button type="button" className="back-button" aria-label="Back to chats" onClick={onBack}><ArrowLeft size={20} weight="bold" /></button>
    <div className="chat-bar-title"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    {venueLinks.length === 1 && <a className="chat-bar-action" href={venueLinks[0]!.href} target="_blank" rel="noopener noreferrer" aria-label="Open venue page"><Browser size={24} /></a>}
    {venueLinks.length > 1 && <>
      <button type="button" aria-label="Open venue page" popoverTarget="venue-links"><Browser size={24} /></button>
      <div id="venue-links" className="venue-links" popover="auto">{venueLinks.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>)}</div>
    </>}
    {onSettings ? <button type="button" aria-label={settingsLabel} disabled={disabled} onClick={onSettings}><GearSix size={24} /></button> : <span className="chat-bar-spacer" />}
  </header>;
}
