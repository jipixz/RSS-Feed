// Íconos SVG inline (stroke 1.6) — del prototipo senal-reader.jsx
interface IconProps {
  s?: number;
}

const I = (p: IconProps) => ({
  width: p.s || 18,
  height: p.s || 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const IcInbox = (p: IconProps) => (<svg {...I(p)}><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>);
export const IcCpu = (p: IconProps) => (<svg {...I(p)}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>);
export const IcCode = (p: IconProps) => (<svg {...I(p)}><path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/></svg>);
export const IcDb = (p: IconProps) => (<svg {...I(p)}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>);
export const IcShield = (p: IconProps) => (<svg {...I(p)}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>);
export const IcSearch = (p: IconProps) => (<svg {...I(p)}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>);
export const IcFilter = (p: IconProps) => (<svg {...I(p)}><path d="M3 4h18l-7 8v6l-4 2v-8L3 4z"/></svg>);
export const IcStar = (p: IconProps) => (<svg {...I(p)}><path d="M12 2 15.09 8.26 22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>);
export const IcStarF = (p: IconProps) => (<svg {...I(p)} fill="currentColor" stroke="none"><path d="M12 2 15.09 8.26 22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>);
export const IcExt = (p: IconProps) => (<svg {...I(p)}><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>);
export const IcSpark = (p: IconProps) => (<svg {...I(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>);
export const IcCheck = (p: IconProps) => (<svg {...I(p)}><path d="M20 6 9 17l-5-5"/></svg>);
export const IcCircle = (p: IconProps) => (<svg width={p.s || 8} height={p.s || 8} viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="currentColor"/></svg>);
export const IcX = (p: IconProps) => (<svg {...I({ s: p.s || 14 })}><path d="M18 6 6 18M6 6l12 12"/></svg>);
export const IcMoon = (p: IconProps) => (<svg {...I(p)}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>);
export const IcSun = (p: IconProps) => (<svg {...I(p)}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>);
export const IcRefresh = (p: IconProps) => (<svg {...I(p)}><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>);
