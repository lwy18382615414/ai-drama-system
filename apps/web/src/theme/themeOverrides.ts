import type { GlobalThemeOverrides } from 'naive-ui'
import { color, font, radius } from './tokens'

/**
 * Maps design tokens onto Naive UI's theme variables.
 * Passed to <n-config-provider :theme-overrides="themeOverrides">.
 */
export const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: color.primary,
    primaryColorHover: color.primaryHover,
    primaryColorPressed: color.primary,
    primaryColorSuppl: color.primaryHover,

    infoColor: color.info,
    warningColor: color.warning,
    warningColorHover: color.warningHover,
    errorColor: color.error,
    successColor: color.primary,

    textColorBase: color.textPrimary,
    textColor1: color.textPrimary,
    textColor2: color.textBody,
    textColor3: color.textSecondary,

    bodyColor: color.bgPage,
    cardColor: color.bgCard,
    borderColor: color.borderCard,

    fontFamily: font.family,
    borderRadius: `${radius.card}px`,
    borderRadiusSmall: `${radius.button}px`,
  },
  Button: {
    borderRadiusMedium: `${radius.button}px`,
  },
  Card: {
    borderRadius: `${radius.card}px`,
  },
}
