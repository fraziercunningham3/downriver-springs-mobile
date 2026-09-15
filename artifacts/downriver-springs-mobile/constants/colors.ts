/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#17202A',
    tint: '#2455D6',

    // Core surfaces
    background: '#F6F7F9',
    foreground: '#17202A',

    // Cards / elevated surfaces
    card: '#FFFFFF',
    cardForeground: '#17202A',

    // Primary action color (buttons, links, active states)
    primary: '#2455D6',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#E9EDF5',
    secondaryForeground: '#233043',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#EEF1F5',
    mutedForeground: '#718096',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#DDE6FF',
    accentForeground: '#1B3B9E',

    // Destructive actions (delete, error states)
    destructive: '#C73E3E',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#DCE2EB',
    input: '#DCE2EB',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 16,
};

export default colors;
