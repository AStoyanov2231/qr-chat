import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { Group } from '@qr-chat/domain';
import { CaretRight, SignOut } from '@phosphor-icons/react';
import { Avatar } from './avatar';
import { SettingsSidebar } from './settings-sidebar';

export function GroupSidebar({ group, userId, busy, onClose, onProfile, onLeave }: { group: Group; userId?: string; busy: boolean; onClose: () => void; onProfile: (id: string) => void; onLeave: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [qrError, setQrError] = useState(false);
  const code = group.venue.codes[0];
  useEffect(() => {
    if (!canvas.current) return;
    void QRCode.toCanvas(canvas.current, code, { width: 200, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#101820', light: '#ffffff' } }).then(() => setQrError(false), () => setQrError(true));
  }, [code]);
  return <SettingsSidebar label="Group settings" onClose={onClose}>{(closeSidebar) => <>
      <div className="group-sidebar-identity">
        <canvas ref={canvas} role="img" aria-label="Group QR code" hidden={qrError} />
        {qrError && <p role="alert">QR code could not be displayed.</p>}
        <h2 id="group-sidebar-title">{group.venue.name}</h2>
        <p>{group.members.length} {group.members.length === 1 ? 'member' : 'members'}</p>
      </div>
      <div className="group-sidebar-members">{group.members.map((member) => <button type="button" className="member-row" key={member.id} aria-label={`View ${member.name}'s profile`} onClick={() => closeSidebar(() => { onClose(); onProfile(member.id); })}><Avatar name={member.name} url={member.avatarUrl} size={44} /><span>{member.id === userId ? 'You' : member.name}</span><CaretRight size={18} /></button>)}</div>
      <button type="button" className="group-leave" disabled={busy} onClick={onLeave}><SignOut size={20} />Leave group</button>
    </>}</SettingsSidebar>;
}
