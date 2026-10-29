import { ArrowLeft, ArrowSquareOut, Users } from '@phosphor-icons/react';

export function ConversationHeader({ title, subtitle, onBack, onSettings, settingsLabel, members, disabled, venueLink }: { title: string; subtitle?: string; onBack: () => void; onSettings?: () => void; settingsLabel?: string; members?: number; disabled?: boolean; venueLink?: string | null }) {
  return <header className="chat-bar">
    <div className="chat-bar-side"><button type="button" className="back-button" aria-label="Back to chats" onClick={onBack}><ArrowLeft size={20} weight="bold" /></button></div>
    <div className="chat-bar-title"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    <div className="chat-bar-side end">
    {venueLink && <a className="chat-bar-action" href={venueLink} target="_blank" rel="noopener noreferrer" aria-label="Open venue page"><ArrowSquareOut size={24} /></a>}
    {onSettings && <button type="button" className="group-member-count" aria-label={settingsLabel} disabled={disabled} onClick={onSettings}>{members !== undefined && (members > 100 ? '+100' : members)}<Users size={18} weight="fill" aria-hidden="true" /></button>}
    </div>
  </header>;
}
