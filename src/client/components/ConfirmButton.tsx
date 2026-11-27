import { useEffect, useState } from 'react';

/** Two-step button instead of a browser confirm dialog: first click arms it, second click confirms. */
export function ConfirmButton(props: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  small?: boolean;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={`btn ${armed ? 'danger' : ''} ${props.small ? 'small' : ''}`}
      disabled={props.disabled}
      title={props.title}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        props.onConfirm();
      }}
    >
      {armed ? props.confirmLabel : props.label}
    </button>
  );
}
