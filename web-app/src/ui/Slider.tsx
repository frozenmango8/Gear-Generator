/**
 * One labelled range control — the `.field` / `.field-head` / `.val` block the
 * control panel repeats a dozen times over.
 *
 * `value` is the EFFECTIVE value (already clamped to [min, max] by the caller),
 * so the thumb, the readout pill and the geometry can never disagree.
 */
import { ReactNode } from "react";

interface Props {
  label: string;
  /** Formatted value for the pill, e.g. "2.0 mm" or "none". */
  display: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  help?: ReactNode;
  /** Style the help line as a warning (undercut, etc.). */
  warn?: boolean;
}

export default function Slider({ label, display, value, min, max, step, onChange, help, warn }: Props) {
  return (
    <div className="field">
      <div className="field-head">
        <span>{label}</span>
        <span className="val">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {help && <small className={warn ? "warn" : undefined}>{help}</small>}
    </div>
  );
}
