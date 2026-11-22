// Inline SVG icons: every button has one, so the game plays with every string blanked (§11).
// No files: the zero-asset rule holds and nothing is requested.

const svg = (body: string, viewBox = '0 0 24 24') =>
  `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  pause: svg('<rect x="6" y="5" width="4.2" height="14" rx="1.4"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4"/>'),
  play: svg('<path d="M8 5.2v13.6c0 .8.9 1.3 1.6.8l10-6.8a1 1 0 0 0 0-1.6l-10-6.8C8.9 3.9 8 4.4 8 5.2z"/>'),
  restart: svg(
    '<path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M19.5 3.2v5h-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  soundOn: svg('<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M15 8.5a5 5 0 0 1 0 7M17.6 6a8.6 8.6 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  soundOff: svg('<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  music: svg('<path d="M9 17.5V6.2l10-2.2v11.3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="6.6" cy="17.6" r="2.8"/><circle cx="16.6" cy="15.6" r="2.8"/>'),
  motion: svg('<path d="M3 8c3-3 6 3 9 0s6 3 9 0M3 16c3-3 6 3 9 0s6 3 9 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  turtle: svg(
    '<ellipse cx="11" cy="13" rx="7" ry="5" fill="#6cc24a"/><path d="M6 13h10M11 8.5v9" stroke="#3f8a2c" stroke-width="1.4"/><circle cx="19.5" cy="12" r="2.4" fill="#9bd77a"/><circle cx="20.3" cy="11.4" r=".55" fill="#2a3a2a"/><rect x="5.5" y="16.5" width="2.6" height="3" rx="1.2" fill="#9bd77a"/><rect x="13.8" y="16.5" width="2.6" height="3" rx="1.2" fill="#9bd77a"/>',
  ),
  hat: svg('<circle cx="12" cy="13.5" r="7" fill="#ff9f1c"/><path d="M12 6.6c1.8-2.6 4.8-3 6-2.2-1.6 2-3.6 3-6 2.2z" fill="#57b04a"/><ellipse cx="9.5" cy="11" rx="2" ry="1.2" fill="#ffc46b"/>'),
  back: svg('<path d="M14.5 5 7.5 12l7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  flag: svg('<rect x="5" y="3" width="2" height="18.5" rx="1" fill="#ffffff" stroke="#8a6a50" stroke-width=".8"/><path d="M7 4h11l-3 4 3 4H7z" fill="#ff4081"/>'),
  tangerine: svg('<circle cx="12" cy="13" r="8" fill="#ff9f1c"/><path d="M12 5.2c2-3 5.4-3.3 6.6-2.4-1.8 2.3-4 3.3-6.6 2.4z" fill="#57b04a"/><ellipse cx="9" cy="10.5" rx="2.2" ry="1.3" fill="#ffc46b"/>'),
  bubble: svg('<circle cx="12" cy="12" r="8.5" fill="#bff6ff" stroke="#7fd8e8" stroke-width="1.5"/><path d="M7.5 9.5a5 5 0 0 1 4-3.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'),
  pinwheel: svg('<path d="M12 12 12 3a5 5 0 0 1 0 9z" fill="#ff6f61"/><path d="M12 12h9a5 5 0 0 1-9 0z" fill="#ffd34d"/><path d="M12 12v9a5 5 0 0 1 0-9z" fill="#3fc6c9"/><path d="M12 12H3a5 5 0 0 1 9 0z" fill="#8fd16a"/><circle cx="12" cy="12" r="1.4" fill="#fff"/>'),
  ring: svg('<circle cx="12" cy="12" r="7" fill="none" stroke="#ff6f61" stroke-width="4.4" stroke-dasharray="5.5 5.5"/><circle cx="12" cy="12" r="7" fill="none" stroke="#ffffff" stroke-width="4.4" stroke-dasharray="5.5 5.5" stroke-dashoffset="5.5"/>'),
  star: svg('<path d="m12 2.8 2.7 5.8 6.3.7-4.7 4.3 1.3 6.3-5.6-3.2-5.6 3.2 1.3-6.3L3 9.3l6.3-.7z" fill="#ffd23f" stroke="#e8a317" stroke-width="1"/>'),
  skate: svg('<path d="M5 5h6v6.5h6.5a2.5 2.5 0 0 1 2.5 2.5v1H5z"/><circle cx="8" cy="18.5" r="2" fill="#4a4a5a"/><circle cx="16.5" cy="18.5" r="2" fill="#4a4a5a"/>'),
  keysSideways: svg(
    '<rect x="1.5" y="9" width="13" height="13" rx="3" fill="#fff" stroke="#9aa9b8" stroke-width="1.4"/><path d="M10.5 15.5H5.5m2.2-2.6-2.6 2.6 2.6 2.6" fill="none" stroke="#3b4a5a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="17.5" y="9" width="13" height="13" rx="3" fill="#fff" stroke="#9aa9b8" stroke-width="1.4"/><path d="M21.5 15.5h5m-2.2-2.6 2.6 2.6-2.6 2.6" fill="none" stroke="#3b4a5a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    '0 0 32 24',
  ),
  keysUpDown: svg(
    '<rect x="1.5" y="9" width="13" height="13" rx="3" fill="#fff" stroke="#9aa9b8" stroke-width="1.4"/><path d="M8 18.5v-6m-2.6 2.2L8 12.1l2.6 2.6" fill="none" stroke="#3b4a5a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="17.5" y="9" width="13" height="13" rx="3" fill="#fff" stroke="#9aa9b8" stroke-width="1.4"/><path d="M24 12.5v6m-2.6-2.2 2.6 2.6 2.6-2.6" fill="none" stroke="#3b4a5a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    '0 0 32 24',
  ),
  keyDown: svg('<rect x="2" y="2" width="20" height="20" rx="4.5" fill="#fff" stroke="#9aa9b8" stroke-width="1.6"/><path d="M12 6.5v10m-4-3.8 4 4 4-4" fill="none" stroke="#3b4a5a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  swipeSideways: svg(
    '<path d="M3 6h9m-3-3 3 3-3 3M29 6h-9m3-3-3 3 3 3" fill="none" stroke="#3b4a5a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.5 22v-8.5a1.6 1.6 0 0 1 3.2 0V17l.3-1.4a1.5 1.5 0 0 1 2.9.5l-.1 1 .3-.8a1.4 1.4 0 0 1 2.7.7v4.5" fill="#ffe0c2" stroke="#9a6a4a" stroke-width="1.2" stroke-linejoin="round"/>',
    '0 0 32 24',
  ),
  swipeUpDown: svg(
    '<path d="M5 3v8m-3-5 3-3 3 3M27 13V5m-3 5 3 3 3-3" fill="none" stroke="#3b4a5a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.5 22v-8.5a1.6 1.6 0 0 1 3.2 0V17l.3-1.4a1.5 1.5 0 0 1 2.9.5l-.1 1 .3-.8a1.4 1.4 0 0 1 2.7.7v4.5" fill="#ffe0c2" stroke="#9a6a4a" stroke-width="1.2" stroke-linejoin="round"/>',
    '0 0 32 24',
  ),
  swipeDown: svg(
    '<path d="M6 3v9m-3-3 3 3 3-3" fill="none" stroke="#3b4a5a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 22v-8.5a1.6 1.6 0 0 1 3.2 0V17l.3-1.4a1.5 1.5 0 0 1 2.9.5l-.1 1 .3-.8a1.4 1.4 0 0 1 2.7.7v4.5" fill="#ffe0c2" stroke="#9a6a4a" stroke-width="1.2" stroke-linejoin="round"/>',
  ),
  zones: [
    svg('<circle cx="12" cy="12" r="10" fill="#3fc6c9"/><path d="M4 14c2.5-2 5-2 8 0s5.5 2 8 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="15" cy="8" r="2.4" fill="#ffd34d"/>'),
    svg('<circle cx="12" cy="12" r="10" fill="#8fd16a"/><circle cx="12" cy="13.5" r="5" fill="#e8433a"/><path d="M12 8.5c.4-1.6 1.6-2.6 3.2-2.8" fill="none" stroke="#6e4526" stroke-width="1.4"/><ellipse cx="10.4" cy="11.6" rx="1.4" ry=".9" fill="#ff8a7a"/>'),
    svg('<circle cx="12" cy="12" r="10" fill="#4aa3e6"/><path d="M12 4.5 17 10l-5 6.5L7 10z" fill="#ff6f61"/><path d="M12 4.5v12M7 10h10" stroke="#fff" stroke-width="1"/><path d="M12 16.5c-1 1.5 1 2 0 3.5" fill="none" stroke="#ffd34d" stroke-width="1.4"/>'),
    svg('<circle cx="12" cy="12" r="10" fill="#8f7fd6"/><circle cx="12" cy="14" r="5.5" fill="#ffcf9a"/><rect x="2" y="15" width="20" height="7" fill="#6fa8c8"/><ellipse cx="9" cy="8.5" rx="2.2" ry="3" fill="#ff9f43"/><path d="M9 5.5v-1.5" stroke="#3a3a4a" stroke-width="1"/>'),
  ],
};

/** The hats and skate swatches of the wardrobe, drawn the way they look on the capybara. */
export const HAT_ICONS = [
  ICONS.hat,
  svg('<ellipse cx="12" cy="13" rx="8.5" ry="6" fill="#ffe14d"/><path d="M3 13l-1.5 0M21 13h1.5" stroke="#f2cf2a" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="9" cy="11" rx="2.2" ry="1.2" fill="#fff3a8"/>'),
  svg('<path d="M4.5 9.5c0-2 3.5-3 7.5-3s7.5 1 7.5 3c0 5-4.5 11-7.5 11s-7.5-6-7.5-11z" fill="#e8333f"/><path d="M7 7l2.5-3 2.5 2 2.5-2L17 7z" fill="#57b04a"/><circle cx="9" cy="12" r=".7" fill="#ffe14d"/><circle cx="14" cy="11" r=".7" fill="#ffe14d"/><circle cx="12" cy="15" r=".7" fill="#ffe14d"/>'),
  svg('<circle cx="12" cy="14" r="7.5" fill="#e8433a"/><path d="M12 6.5V3.5" stroke="#6e4526" stroke-width="1.6"/><path d="M12.5 5c1.5-2 4-2.2 5-1.5-1.4 1.6-3 2.2-5 1.5z" fill="#57b04a"/><ellipse cx="9" cy="11.5" rx="2" ry="1.2" fill="#ff8a7a"/>'),
  svg('<circle cx="12" cy="16" r="6" fill="#c6d94a"/><circle cx="12" cy="9.5" r="4" fill="#c6d94a"/><path d="M12 5.5v-2.5" stroke="#6e4526" stroke-width="1.6"/>'),
];
