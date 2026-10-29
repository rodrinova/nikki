// Setas e voltar com o ângulo dos bigodes da marca (57,4° com a horizontal): o único ângulo das setas na app.
const P: Record<string, string> = {
  home: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  bubble: '<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z"/><path d="M12 8.5v3.5M12 14.5v.01"/>',
  umbrella: '<path d="M3.5 12.5a8.5 8.5 0 0 1 17 0z"/><path d="M12 12.5v5.5a2 2 0 0 1-4 0M12 4V3"/>',
  ask: '<path d="M12 3.5 13.8 9 19.5 10.8 13.8 12.6 12 18.2 10.2 12.6 4.5 10.8 10.2 9z"/><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  back: '<path d="M13.16 5.5 9 12l4.16 6.5"/>',
  arrow: '<path d="M5 12h14M14.84 5.5 19 12l-4.16 6.5"/>',
  chev: '<path d="M9.94 5.5 14.1 12l-4.16 6.5"/>',
  check: '<path d="M6 12.5l4 4 8-9"/>',
  coins: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
  heart: '<path d="M12 19.5s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 7.7a3.9 3.9 0 0 1 7 2.2c0 5.2-7 9.6-7 9.6z"/>',
  basket: '<path d="M3.5 9.5h17l-1.6 9a1.5 1.5 0 0 1-1.5 1.2H6.6a1.5 1.5 0 0 1-1.5-1.2zM8 9.5 11 4M16 9.5 13 4"/>',
  car: '<path d="M4 16.5v-4.5l2.2-5.2A2 2 0 0 1 8 5.5h8a2 2 0 0 1 1.8 1.3L20 12v4.5"/><path d="M3.5 16.5h17M4 12h16"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
  cal: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
  house: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M10 20v-5h4v5"/>',
  people: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.5 14.4c2.3.1 4.2 1.6 4.8 4.6"/>',
  bars: '<path d="M5 20V11M10 20V5M15 20v-7M20 20V8"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5h4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  broom: '<path d="M15.5 3.5 12 11"/><path d="M8.5 11h7l1.5 3.5c.8 2-.4 5.5-.4 5.5H7.4s-1.2-3.5-.4-5.5z"/><path d="M10 16.5v3.5M13.5 16.5v3.5"/>',
  chat: '<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z"/>',
  cam: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.4-2h5.6l1.4 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.4"/>',
  doc: '<path d="M7 3.5h7l4 4V20H6V3.5z"/><path d="M14 3.5V8h4M9 12h6M9 15.5h6"/>',
};

export function Icon({ n, s = 22, w = 1.5 }: { n: keyof typeof P | string; s?: number; w?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[n] ?? '' }} />;
}
