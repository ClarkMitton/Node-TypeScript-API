import { useEffect, useRef, useState } from "react";

const TRACKS = [
  { id: "lofi1",    label: "Lo-Fi 1",  src: "/music/lofi-1.mp3" },
  { id: "lofi2",    label: "Lo-Fi 2",  src: "/music/lofi-2.mp3" },
  { id: "tranquil", label: "Tranquil", src: "/music/tranquil.mp3" },
];

type Props = {
  onPlayStateChange?: (playing: boolean, trackId: string) => void;
};

export function RadioPlayer({ onPlayStateChange }: Props) {
  const audioRef  = useRef<HTMLAudioElement | null>(null);
  const [playing,    setPlaying]    = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [open,       setOpen]       = useState(false);

  const track = TRACKS[trackIndex];

  useEffect(() => {
    audioRef.current = new Audio(track.src);
    audioRef.current.loop = true;
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.src = track.src;
    if (playing) audioRef.current.play().catch(() => setPlaying(false));
  }, [trackIndex]); // eslint-disable-line

  function toggle() {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
      onPlayStateChange?.(false, track.id);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
      onPlayStateChange?.(true, track.id);
    }
  }

  function selectTrack(i: number) {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setTrackIndex(i);
    setPlaying(false);
    onPlayStateChange?.(false, TRACKS[i].id);
    setOpen(false);
  }

  const pillStyle: React.CSSProperties = {
    position:        "fixed",
    bottom:          32,
    left:            "50%",
    transform:       "translateX(-50%)",
    zIndex:          50,
    display:         "inline-flex",
    alignItems:      "center",
    gap:             16,
    padding:         "10px 20px",
    background:      "var(--bg-elevated)",
    border:          "1px solid var(--sd-border)",
    borderRadius:    100,
    backdropFilter:  "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    whiteSpace:      "nowrap",
    minHeight:       52,
  };

  const playBtnStyle: React.CSSProperties = {
    width:          32,
    height:         32,
    minHeight:      32,
    borderRadius:   "50%",
    background:     "var(--sd-accent)",
    border:         "none",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    cursor:         "pointer",
    color:          "var(--bg-primary)",
    flexShrink:     0,
    padding:        0,
  };

  return (
    <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", zIndex: 50 }}>
      {/* Track popover — above the pill */}
      {open && (
        <div
          style={{
            position:     "absolute",
            bottom:       "calc(100% + 8px)",
            left:         0,
            right:        0,
            background:   "var(--bg-elevated)",
            border:       "1px solid var(--sd-border)",
            borderRadius: 12,
            overflow:     "hidden",
          }}
        >
          {TRACKS.map((t, i) => (
            <button
              key={t.id}
              onClick={() => selectTrack(i)}
              style={{
                display:        "block",
                width:          "100%",
                height:         40,
                minHeight:      40,
                textAlign:      "left",
                padding:        "0 16px",
                border:         "none",
                background:     "transparent",
                fontFamily:     "var(--font-body)",
                fontSize:       14,
                color:          i === trackIndex ? "var(--text-primary)" : "var(--text-secondary)",
                cursor:         "pointer",
                transition:     "background 100ms",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "var(--bg-surface)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "transparent")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Pill */}
      <div style={pillStyle}>
        {/* Play/pause */}
        <button onClick={toggle} style={playBtnStyle} aria-label={playing ? "Pause" : "Play"}>
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="2" y="1" width="3" height="12" rx="1" />
              <rect x="9" y="1" width="3" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M3 1.5l9 5.5-9 5.5V1.5z" />
            </svg>
          )}
        </button>

        {/* Track name */}
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize:   14,
            fontWeight: 400,
            color:      "var(--text-secondary)",
          }}
        >
          {track.label}
        </span>

        {/* Chevron */}
        <button
          onClick={() => setOpen(!open)}
          style={{
            background: "transparent",
            border:     "none",
            padding:    0,
            minHeight:  "auto",
            cursor:     "pointer",
            color:      "var(--text-muted)",
            fontSize:   12,
            lineHeight: 1,
            display:    "flex",
            alignItems: "center",
          }}
          aria-label="Select track"
        >
          {open ? "▴" : "▾"}
        </button>
      </div>
    </div>
  );
}
