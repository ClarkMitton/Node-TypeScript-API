import { useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

const ROWS = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
  [".", "0", "⌫"],
];

export function NumberPad({ value, onChange, onSubmit, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function press(key: string) {
    if (disabled) return;
    if (key === "⌫") onChange(value.slice(0, -1));
    else onChange(value + key);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") onSubmit();
  }

  const keyStyle: React.CSSProperties = {
    height:         58,
    minHeight:      58,
    borderRadius:   8,
    background:     "var(--bg-elevated)",
    border:         "none",
    fontFamily:     "var(--font-body)",
    fontSize:       22,
    fontWeight:     500,
    color:          "var(--text-primary)",
    cursor:         disabled ? "not-allowed" : "pointer",
    opacity:        disabled ? 0.4 : 1,
    transition:     "background 100ms, transform 80ms",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    padding:        0,
    userSelect:     "none",
  };

  const canSubmit = !disabled && value.trim().length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, width: "100%", maxWidth: 380 }}>
      {/* Answer display box */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="--"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        style={{
          background:    "var(--bg-surface)",
          borderRadius:  8,
          padding:       "18px 24px",
          minHeight:     58,
          fontFamily:    '"DM Mono", "Courier New", monospace',
          fontSize:      28,
          color:         value ? "var(--text-primary)" : "var(--text-muted)",
          width:         "100%",
          border:        "none",
          outline:       "none",
          marginBottom:  24,
          boxSizing:     "border-box",
          opacity:       disabled ? 0.5 : 1,
        }}
      />

      {/* Grid rows */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 10 }}>
        {ROWS.flat().map((key, i) => (
          <button
            key={i}
            type="button"
            onClick={() => press(key)}
            disabled={disabled}
            style={keyStyle}
            onMouseEnter={(e) => {
              if (!disabled) (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
            }}
            onMouseDown={(e) => {
              if (!disabled) (e.currentTarget as HTMLElement).style.transform = "scale(0.94)";
            }}
            onMouseUp={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "scale(1)";
            }}
          >
            {key}
          </button>
        ))}
      </div>

      {/* Minus — full width */}
      <button
        type="button"
        onClick={() => press("-")}
        disabled={disabled}
        style={{ ...keyStyle, width: "100%", marginBottom: 16, gridColumn: "1 / -1" }}
        onMouseEnter={(e) => {
          if (!disabled) (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
        }}
        onMouseDown={(e) => {
          if (!disabled) (e.currentTarget as HTMLElement).style.transform = "scale(0.94)";
        }}
        onMouseUp={(e) => {
          (e.currentTarget as HTMLElement).style.transform = "scale(1)";
        }}
      >
        −
      </button>

      {/* Submit */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        style={{
          width:          "100%",
          height:         58,
          minHeight:      58,
          borderRadius:   8,
          border:         "none",
          fontFamily:     "var(--font-heading)",
          fontSize:       18,
          fontWeight:     600,
          cursor:         canSubmit ? "pointer" : "not-allowed",
          transition:     "background 150ms, transform 100ms",
          background:     canSubmit ? "var(--sd-accent)" : "var(--bg-elevated)",
          color:          canSubmit ? "var(--bg-primary)" : "var(--text-muted)",
          marginTop:      0,
        }}
        onMouseDown={(e) => {
          if (canSubmit) (e.currentTarget as HTMLElement).style.transform = "scale(0.97)";
        }}
        onMouseUp={(e) => {
          (e.currentTarget as HTMLElement).style.transform = "scale(1)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.transform = "scale(1)";
        }}
      >
        {disabled ? "Checking…" : "Submit"}
      </button>
    </div>
  );
}
