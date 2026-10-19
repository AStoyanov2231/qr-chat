import { ArrowLeft, Browser, GearSix } from '@phosphor-icons/react';

export function ConversationHeader({ title, subtitle, onBack, onSettings, settingsLabel, disabled, venueLink }: { title: string; subtitle?: string; onBack: () => void; onSettings?: () => void; settingsLabel?: string; disabled?: boolean; venueLink?: string | null }) {
  return <header className="chat-bar">
    <div className="chat-bar-side"><button type="button" className="back-button" aria-label="Back to chats" onClick={onBack}><ArrowLeft size={20} weight="bold" /></button></div>
    <div className="chat-bar-title"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    <div className="chat-bar-side end">
    {venueLink && <a className="chat-bar-action" href={venueLink} target="_blank" rel="noopener noreferrer" aria-label="Open venue page"><Browser size={24} /></a>}
    {onSettings && <button type="button" aria-label={settingsLabel} disabled={disabled} onClick={onSettings}><GearSix size={24} /></button>}
    </div>
  </header>;
}
