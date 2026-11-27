// Team management + attendance. Members with the same group (e.g. FE, BE) always speak back-to-back.

import { useState } from 'react';
import { api } from '../api';
import type { Member } from '../../shared/types';
import { ConfirmButton } from './ConfirmButton';

export function TeamPanel(props: {
  members: Member[];
  attendance: number[];
  disabled: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { members, attendance, run, disabled } = props;
  const active = members.filter((m) => m.active);
  const archived = members.filter((m) => !m.active);
  const groups = [...new Set(['FE', 'BE', ...members.map((m) => m.group).filter((g): g is string => !!g)])];
  const [showArchived, setShowArchived] = useState(false);

  return (
    <div>
      <datalist id="groups">
        {groups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      {active.length === 0 && <p className="muted">No team members yet – add the first one below.</p>}
      <ul className="team-list">
        {active.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            present={attendance.includes(m.id)}
            disabled={disabled}
            run={run}
          />
        ))}
      </ul>

      <AddMember run={run} />

      <p className="muted small">
        Group: people with the same group (e.g. <span className="mono">FE</span>, <span className="mono">BE</span>) always
        speak back-to-back. Leave empty for people who can be anywhere (e.g. the tech lead).
      </p>

      {archived.length > 0 && (
        <div className="archived">
          <button className="link" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? '▾' : '▸'} Former members ({archived.length})
          </button>
          {showArchived && (
            <ul className="team-list">
              {archived.map((m) => (
                <li key={m.id} className="archived-row">
                  <span className="grow">
                    {m.name} {m.group && <span className="badge">{m.group}</span>}
                  </span>
                  <button className="btn small" onClick={() => run(() => api.updateMember(m.id, { active: true }))}>
                    Restore
                  </button>
                  <ConfirmButton small label="Delete" confirmLabel="Delete for good?" onConfirm={() => run(() => api.deleteMember(m.id))} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function MemberRow(props: {
  member: Member;
  present: boolean;
  disabled: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { member: m, present, run, disabled } = props;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(m.name);
  const [group, setGroup] = useState(m.group ?? '');

  const save = () => {
    setEditing(false);
    if (name.trim() === m.name && (group.trim() || null) === (m.group ?? null)) return;
    run(() => api.updateMember(m.id, { name, group: group.trim() || null }));
  };

  return (
    <li className={present ? '' : 'absent'}>
      <label className="toggle" title={present ? 'Present – click to mark absent' : 'Absent – click to mark present'}>
        <input type="checkbox" checked={present} disabled={disabled} onChange={(e) => run(() => api.setPresent(m.id, e.target.checked))} />
        <span className="toggle-track" />
      </label>
      {editing ? (
        <form
          className="row grow"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Name" />
          <input className="group-input" value={group} onChange={(e) => setGroup(e.target.value)} list="groups" placeholder="Group" aria-label="Group" />
          <button className="btn small primary" type="submit">
            Save
          </button>
          <button
            className="btn small"
            type="button"
            onClick={() => {
              setName(m.name);
              setGroup(m.group ?? '');
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <span className="grow member-name" onDoubleClick={() => setEditing(true)}>
            {m.name} {m.group && <span className="badge">{m.group}</span>}
          </span>
          <button className="btn small" onClick={() => setEditing(true)}>
            Edit
          </button>
          <ConfirmButton
            small
            label="Remove"
            confirmLabel="Move to former?"
            title="Moves the member to 'Former members' (can be restored)"
            onConfirm={() => run(() => api.updateMember(m.id, { active: false }))}
          />
        </>
      )}
    </li>
  );
}

function AddMember(props: { run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  return (
    <form
      className="row add-member"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        props.run(() => api.addMember(name, group.trim() || null));
        setName('');
        setGroup('');
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="New member name" />
      <input className="group-input" value={group} onChange={(e) => setGroup(e.target.value)} list="groups" placeholder="Group" aria-label="New member group" />
      <button className="btn" type="submit" disabled={!name.trim()}>
        Add
      </button>
    </form>
  );
}
