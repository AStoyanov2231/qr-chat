import Image from 'next/image';
import { groupInitials, type Group } from '@qr-chat/domain';
import { CaretRight } from '@phosphor-icons/react';
import { Avatar } from './avatar';
import { SettingsSidebar } from './settings-sidebar';

export function GroupSidebar({ group, userId, onClose, onProfile, onReport }: { group: Group; userId?: string; onClose: () => void; onProfile: (id: string) => void; onReport: () => void }) {
  return <SettingsSidebar label="Group members" onClose={onClose}>{(closeSidebar) => <>
      {group.venue.imageUrl
        ? <Image className="group-sidebar-cover" src={group.venue.imageUrl} alt="" width={350} height={262} unoptimized />
        : <span className="group-sidebar-cover" aria-hidden="true">{groupInitials(group.venue.name)}</span>}
      <h2 className="group-sidebar-heading">{group.members.length} {group.members.length === 1 ? 'member' : 'members'}</h2>
      <div className="group-sidebar-members">{group.members.map((member) => <button type="button" className="member-row" key={member.id} aria-label={`View ${member.name}'s profile`} onClick={() => closeSidebar(() => { onClose(); onProfile(member.id); })}><Avatar name={member.name} url={member.avatarUrl} size={44} /><span>{member.id === userId ? 'You' : member.name}{member.id === group.venue.place?.ownerId && <span className="owner-tag">Owner</span>}</span><CaretRight size={18} /></button>)}</div>
      <button type="button" className="request-block" onClick={() => closeSidebar(() => { onClose(); onReport(); })}>Report group</button>
    </>}</SettingsSidebar>;
}
