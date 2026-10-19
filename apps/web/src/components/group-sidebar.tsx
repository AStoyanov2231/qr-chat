import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { qrPayload, type Group } from '@qr-chat/domain';
import { CaretRight, Users } from '@phosphor-icons/react';
import { Avatar } from './avatar';
import { SettingsSidebar } from './settings-sidebar';
import { appOrigin } from '@/lib/app-origin';

export function GroupSidebar({ group, userId, onClose, onProfile }: { group: Group; userId?: string; onClose: () => void; onProfile: (id: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [qrError, setQrError] = useState(false);
  const code = group.venue.codes[0];
  useEffect(() => {
    if (!canvas.current) return;
    void QRCode.toCanvas(canvas.current, qrPayload(code, appOrigin()), { width: 200, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } }).then(() => setQrError(false), () => setQrError(true));
  }, [code]);
  return <SettingsSidebar label="Group settings" onClose={onClose}>{(closeSidebar) => <>
      <div className="group-sidebar-identity">
        <canvas ref={canvas} role="img" aria-label="Group QR code" hidden={qrError} />
        {qrError && <p role="alert">QR code could not be displayed.</p>}
        <span className="group-member-count" aria-label={`${group.members.length} ${group.members.length === 1 ? 'member' : 'members'}`}><span aria-hidden="true">{group.members.length}</span><Users size={18} weight="fill" aria-hidden="true" /></span>
      </div>
      <div className="group-sidebar-members">{group.members.map((member) => <button type="button" className="member-row" key={member.id} aria-label={`View ${member.name}'s profile`} onClick={() => closeSidebar(() => { onClose(); onProfile(member.id); })}><Avatar name={member.name} url={member.avatarUrl} size={44} /><span>{member.id === userId ? 'You' : member.name}{member.id === group.venue.place?.ownerId && <span className="owner-tag">Owner</span>}</span><CaretRight size={18} /></button>)}</div>
    </>}</SettingsSidebar>;
}
