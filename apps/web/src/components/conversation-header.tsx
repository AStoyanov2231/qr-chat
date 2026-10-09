import { ArrowLeft, GearSix } from '@phosphor-icons/react';

export function ConversationHeader({ title, subtitle, onBack, onSettings, settingsLabel, disabled }: { title: string; subtitle?: string; onBack: () => void; onSettings?: () => void; settingsLabel?: string; disabled?: boolean }) {
  return <header className="chat-bar">
    <button type="button" className="back-button" aria-label="Back to chats" onClick={onBack}><ArrowLeft size={20} weight="bold" /></button>
    <div className="chat-bar-title"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    {onSettings ? <button type="button" aria-label={settingsLabel} disabled={disabled} onClick={onSettings}><GearSix size={24} /></button> : <span className="chat-bar-spacer" />}
  </header>;
}
