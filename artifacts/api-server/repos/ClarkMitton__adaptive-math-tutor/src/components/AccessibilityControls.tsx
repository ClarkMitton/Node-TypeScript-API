import { useState } from "react";

export type AccessibilitySettings = {
  colourOverlay: "yellow" | "blue" | "green" | "pink" | null;
  textSize: "default" | "large" | "largest";
  highContrast: boolean;
  fontFamily: "default" | "opendyslexic";
};

export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  colourOverlay: null,
  textSize: "default",
  highContrast: false,
  fontFamily: "default",
};

type Props = {
  settings: AccessibilitySettings;
  onUpdate: (s: AccessibilitySettings) => void;
};

const OVERLAYS: Array<{ key: AccessibilitySettings["colourOverlay"]; label: string; bg: string }> = [
  { key: null,     label: "None",   bg: "none" },
  { key: "yellow", label: "Yellow", bg: "#ffff80" },
  { key: "blue",   label: "Blue",   bg: "#80c0ff" },
  { key: "green",  label: "Green",  bg: "#80ff80" },
  { key: "pink",   label: "Pink",   bg: "#ffb0d0" },
];

const s: Record<string, React.CSSProperties> = {
  trigger: {
    position: "fixed",
    top: 24,
    right: 24,
    width: 32,
    height: 32,
    minHeight: 32,
    borderRadius: "50%",
    background: "var(--bg-elevated)",
    border: "1px solid var(--sd-border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    zIndex: 100,
    transition: "border-color 150ms",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-secondary)",
    padding: 0,
  },
  panel: {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    width: 240,
    background: "var(--bg-elevated)",
    border: "1px solid var(--sd-border)",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
    zIndex: 101,
  },
  sectionLabel: {
    fontFamily: "var(--font-body)",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    marginBottom: 8,
    display: "block",
  },
  overlayRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap" as const,
  },
  circle: {
    width: 28,
    height: 28,
    minHeight: 28,
    borderRadius: "50%",
    cursor: "pointer",
    border: "2px solid transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    transition: "border-color 120ms",
    flexShrink: 0,
  },
  textSizeRow: {
    display: "flex",
    gap: 6,
  },
  textSizeBtn: {
    width: 40,
    height: 32,
    minHeight: 32,
    borderRadius: 6,
    border: "1px solid var(--sd-border)",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    cursor: "pointer",
    transition: "background 120ms, color 120ms",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleLabel: {
    fontFamily: "var(--font-body)",
    fontSize: 13,
    color: "var(--text-secondary)",
  },
  togglePill: {
    width: 40,
    height: 22,
    minHeight: 22,
    borderRadius: 100,
    cursor: "pointer",
    border: "none",
    position: "relative" as const,
    transition: "background 150ms",
    padding: 0,
    flexShrink: 0,
  },
  toggleThumb: {
    position: "absolute" as const,
    top: 2,
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "var(--bg-elevated)",
    transition: "left 150ms",
  },
  divider: {
    height: 1,
    background: "var(--sd-border)",
    margin: "12px 0",
  },
};

export function AccessibilityControls({ settings, onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [triggerHover, setTriggerHover] = useState(false);

  function set<K extends keyof AccessibilitySettings>(key: K, val: AccessibilitySettings[K]) {
    onUpdate({ ...settings, [key]: val });
  }

  return (
    <>
      {settings.colourOverlay && (
        <div className={`colour-overlay colour-overlay-${settings.colourOverlay}`} />
      )}

      <div style={{ position: "fixed", top: 24, right: 24, zIndex: 100 }}>
        <button
          onClick={() => setOpen(!open)}
          onMouseEnter={() => setTriggerHover(true)}
          onMouseLeave={() => setTriggerHover(false)}
          style={{
            ...s.trigger,
            borderColor: triggerHover ? "var(--sd-accent)" : "var(--sd-border)",
          }}
          aria-label="Accessibility settings"
        >
          Aa
        </button>

        {open && (
          <div style={s.panel}>
            {/* Colour overlay */}
            <div style={{ marginBottom: 16 }}>
              <span style={s.sectionLabel}>Colour overlay</span>
              <div style={s.overlayRow}>
                {OVERLAYS.map((o) => {
                  const isActive = settings.colourOverlay === o.key;
                  if (o.key === null) {
                    return (
                      <button
                        key="none"
                        onClick={() => set("colourOverlay", null)}
                        title="None"
                        style={{
                          ...s.circle,
                          background: "var(--bg-primary)",
                          borderColor: isActive ? "var(--sd-accent)" : "var(--sd-border)",
                          overflow: "hidden",
                          position: "relative",
                        }}
                        aria-label="No colour overlay"
                      >
                        <svg width="18" height="18" viewBox="0 0 18 18" style={{ position: "absolute" }}>
                          <line x1="3" y1="15" x2="15" y2="3" stroke="var(--text-muted)" strokeWidth="1.5" />
                        </svg>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={String(o.key)}
                      onClick={() => set("colourOverlay", o.key)}
                      title={o.label}
                      style={{
                        ...s.circle,
                        background: o.bg,
                        borderColor: isActive ? "var(--sd-accent)" : "transparent",
                      }}
                      aria-label={`${o.label} overlay`}
                    />
                  );
                })}
              </div>
            </div>

            <div style={s.divider} />

            {/* Text size */}
            <div style={{ marginBottom: 16 }}>
              <span style={s.sectionLabel}>Text size</span>
              <div style={s.textSizeRow}>
                {(["default", "large", "largest"] as const).map((sz, i) => {
                  const isActive = settings.textSize === sz;
                  return (
                    <button
                      key={sz}
                      onClick={() => set("textSize", sz)}
                      style={{
                        ...s.textSizeBtn,
                        background: isActive ? "var(--sd-accent)" : "var(--bg-primary)",
                        color: isActive ? "var(--bg-primary)" : "var(--text-primary)",
                        borderColor: isActive ? "var(--sd-accent)" : "var(--sd-border)",
                      }}
                    >
                      {i === 0 ? "A" : i === 1 ? "A+" : "A++"}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={s.divider} />

            {/* High contrast */}
            <div style={{ ...s.toggleRow, marginBottom: 12 }}>
              <span style={s.toggleLabel}>High contrast</span>
              <button
                onClick={() => set("highContrast", !settings.highContrast)}
                style={{
                  ...s.togglePill,
                  background: settings.highContrast ? "var(--sd-accent)" : "var(--bg-primary)",
                  border: `1px solid ${settings.highContrast ? "var(--sd-accent)" : "var(--sd-border)"}`,
                }}
                aria-label="Toggle high contrast"
              >
                <span
                  style={{
                    ...s.toggleThumb,
                    left: settings.highContrast ? 18 : 2,
                  }}
                />
              </button>
            </div>

            {/* OpenDyslexic */}
            <div style={s.toggleRow}>
              <span style={s.toggleLabel}>OpenDyslexic</span>
              <button
                onClick={() =>
                  set("fontFamily", settings.fontFamily === "opendyslexic" ? "default" : "opendyslexic")
                }
                style={{
                  ...s.togglePill,
                  background:
                    settings.fontFamily === "opendyslexic" ? "var(--sd-accent)" : "var(--bg-primary)",
                  border: `1px solid ${
                    settings.fontFamily === "opendyslexic" ? "var(--sd-accent)" : "var(--sd-border)"
                  }`,
                }}
                aria-label="Toggle OpenDyslexic font"
              >
                <span
                  style={{
                    ...s.toggleThumb,
                    left: settings.fontFamily === "opendyslexic" ? 18 : 2,
                  }}
                />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function buildBodyClasses(
  theme: string,
  settings: AccessibilitySettings,
): string {
  const classes: string[] = [theme === "forecourt" ? "theme-forecourt" : "theme-library"];
  if (settings.textSize !== "default") classes.push(`text-size-${settings.textSize}`);
  if (settings.highContrast) classes.push("high-contrast");
  if (settings.fontFamily === "opendyslexic") classes.push("font-opendyslexic");
  return classes.join(" ");
}
