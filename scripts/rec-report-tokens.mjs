// Kitab report colour tokens (light + dark), shared by the bake-off reports.
export const TOKENS = `  :root {
    color-scheme: light;
    --paper: #FAF7F2;
    --surface: #FFFFFF;
    --surface-2: #F3EDE3;
    --line: #E8DDD0;
    --line-strong: #D4C4B0;
    --ink: #1C1917;
    --ink-2: #44403C;
    --ink-3: #78716C;
    --ink-4: #A8A29E;
    --teal: #0F766E;
    --teal-ink: #115E59;
    --teal-wash: #F0FDFA;
    --teal-line: #99F6E4;
    --amber: #B45309;
    --amber-wash: #FFFBEB;
    --amber-line: #FDE68A;
    --rose: #BE123C;
    --rose-wash: #FFF1F2;
    --rose-line: #FECDD3;
    --slate: #57534E;
    --slate-wash: #F5F0EB;
    --shadow: 0 1px 3px rgba(28,25,23,.08), 0 1px 2px rgba(28,25,23,.06);
    --serif: 'Playfair Display', Georgia, 'Times New Roman', serif;
    --sans: 'DM Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --paper: #1C1917;
      --surface: #292524;
      --surface-2: #211E1B;
      --line: #44403C;
      --line-strong: #57534E;
      --ink: #FAF7F2;
      --ink-2: #E8DDD0;
      --ink-3: #A8A29E;
      --ink-4: #78716C;
      --teal: #2DD4BF;
      --teal-ink: #99F6E4;
      --teal-wash: rgba(20,184,166,.10);
      --teal-line: rgba(45,212,191,.35);
      --amber: #FBBF24;
      --amber-wash: rgba(245,158,11,.10);
      --amber-line: rgba(251,191,36,.35);
      --rose: #FB7185;
      --rose-wash: rgba(244,63,94,.10);
      --rose-line: rgba(251,113,133,.35);
      --slate: #D6D3D1;
      --slate-wash: rgba(214,211,209,.08);
      --shadow: 0 1px 3px rgba(0,0,0,.4);
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --paper: #1C1917;
    --surface: #292524;
    --surface-2: #211E1B;
    --line: #44403C;
    --line-strong: #57534E;
    --ink: #FAF7F2;
    --ink-2: #E8DDD0;
    --ink-3: #A8A29E;
    --ink-4: #78716C;
    --teal: #2DD4BF;
    --teal-ink: #99F6E4;
    --teal-wash: rgba(20,184,166,.10);
    --teal-line: rgba(45,212,191,.35);
    --amber: #FBBF24;
    --amber-wash: rgba(245,158,11,.10);
    --amber-line: rgba(251,191,36,.35);
    --rose: #FB7185;
    --rose-wash: rgba(244,63,94,.10);
    --rose-line: rgba(251,113,133,.35);
    --slate: #D6D3D1;
    --slate-wash: rgba(214,211,209,.08);
    --shadow: 0 1px 3px rgba(0,0,0,.4);
  }`
