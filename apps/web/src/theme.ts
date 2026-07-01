import type { GlobalThemeOverrides } from 'naive-ui'

// Maps the StoryFrame CSS tokens (src/assets/css/storyframe.css) onto Naive UI's
// theme so library components match the app's hand-rolled ones.
export const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#2f55d4',
    primaryColorHover: '#4a6fe0',
    primaryColorPressed: '#24409e',
    primaryColorSuppl: '#4a6fe0',
    infoColor: '#0ea5e9',
    infoColorHover: '#38bdf8',
    successColor: '#16a34a',
    successColorHover: '#22b855',
    warningColor: '#d97706',
    warningColorHover: '#e2870f',
    errorColor: '#dc2626',
    errorColorHover: '#e64545',
    textColorBase: '#101828',
    textColor1: '#101828',
    textColor2: '#4b5876',
    textColor3: '#8a93a6',
    borderColor: '#e2e8f0',
    bodyColor: '#f6f8fc',
    cardColor: '#ffffff',
    popoverColor: '#ffffff',
    fontFamily:
      '"Inter", "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    borderRadius: '6px',
  },
}
