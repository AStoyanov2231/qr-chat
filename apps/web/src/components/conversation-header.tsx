import { ArrowLeft, GearSix } from '@phosphor-icons/react';

export function ConversationHeader({ title, subtitle, imageUrl, onBack, onSettings, settingsLabel, disabled }: { title: string; subtitle?: string; imageUrl?: string | null; onBack: () => void; onSettings?: () => void; settingsLabel?: string; disabled?: boolean }) {
  return <>
    <header className="chat-photo-header">
      <div className="chat-header-backdrop" aria-hidden="true" style={imageUrl ? { backgroundImage: `linear-gradient(rgba(10,20,30,.2),rgba(10,20,30,.38)),url(${JSON.stringify(imageUrl)})` } : undefined} />
      <div className="chat-header-title"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    </header>
    <div className="chat-header-controls">
      <button type="button" aria-label="Back to chats" onClick={onBack}><ArrowLeft size={23} /></button>
      {onSettings && <button type="button" aria-label={settingsLabel} disabled={disabled} onClick={onSettings}><GearSix size={24} /></button>}
    </div>
  </>;
}
