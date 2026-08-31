/**
 * A pill-style exclusive choice (`.seg`). Given a `label` it renders as a
 * labelled fieldset (pressure angle, bore shape); without one it renders as a
 * bare group needing `ariaLabel` (the mode switcher above the panel).
 */
import { ReactNode } from "react";

interface Props<T extends string | number> {
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label?: string;
  ariaLabel?: string;
  help?: ReactNode;
}

export default function Segmented<T extends string | number>({
  value, options, onChange, label, ariaLabel, help,
}: Props<T>) {
  const buttons = (
    <div className="seg" role={label ? undefined : "group"} aria-label={label ? undefined : ariaLabel}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  if (!label) return buttons;
  return (
    <fieldset className="field">
      <span>{label}</span>
      {buttons}
      {help && <small>{help}</small>}
    </fieldset>
  );
}
