/**
 * Design tokens — verbatim from design_handoff_novel_workbench/README.md §Design Tokens.
 * These are the source of truth; Naive UI theme overrides (themeOverrides.ts) derive from them.
 */

export const color = {
  // primary (绿)
  primary: '#18a058',
  primaryHover: '#36ad6a',
  primaryLight: '#e7f5ee',
  primaryBorder: '#c3e6d2',
  primaryDisabled: '#bfe3cf',

  // info (蓝)
  info: '#2080f0',
  infoLight: '#eaf3fd',
  infoLightAlt: '#e8f2fd',
  infoSpinnerTrack: '#bcd9f8',

  // warning / stale (黄)
  warning: '#f0a020',
  warningHover: '#fcb040',
  warningText: '#ad7a1e',
  warningTextAlt: '#7a5a14',
  warningTextAlt2: '#8a6116',
  warningLight: '#fdf3e3',
  warningLightAlt: '#fdf6e9',
  warningBorder: '#f3e3bf',

  // error (红)
  error: '#d03050',
  errorLight: '#fbeef1',
  errorBorder: '#f6d5dd',
  errorTextDeep: '#8c2740',

  // manual appearance version / key prop (紫)
  manual: '#7b5cd6',
  manualLight: '#f1eafd',

  // text
  textPrimary: '#1f2225',
  textBody: '#2b2f33',
  textSecondary: '#5b6169',
  textWeak: '#8a9099',
  textWeakest: '#a0a6ad',

  // background
  bgPage: '#f5f7f9',
  bgPageDetail: '#eef1f4',
  bgCard: '#ffffff',
  bgSoft: '#fafbfc',
  bgSoftAlt: '#f7f9fa',
  placeholder: '#eef1f3',
  placeholderAlt: '#f1f3f5',

  // border
  borderCard: '#e4e7eb',
  borderCardAlt: '#e8eaed',
  borderDivider: '#edf0f2',
  borderDividerAlt: '#f2f4f6',
  borderInput: '#dfe3e7',
  borderInputAlt: '#e0e3e7',
} as const

export const font = {
  family:
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif",
  sizes: [11, 12, 13, 13.5, 14, 15, 16, 18, 20] as const,
  weightNormal: 400,
  weightBold: 600,
} as const

export const radius = {
  badge: 4,
  button: 6,
  input: 6,
  cell: 6,
  card: 8,
  cardLarge: 14,
  pill: 12,
} as const

/** Fixed layout dimensions (px) referenced across shells. */
export const layout = {
  sidebar: 208,
  workspaceNav: 232,
  drawerMin: 380,
  drawerMax: 440,
  modalMin: 400,
  modalMax: 560,
  topbar: 52,
  topbarTall: 56,
} as const
