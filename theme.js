const ThemeManager = (() => {
  const STORAGE_KEY = 'familyhub_theme';
  const AI_STORAGE_KEY = 'familyhub_ai_theme';
  const DEFAULT_THEME = 'theme-default';

  const CUSTOM_VARIABLES = [
    '--app-background',
    '--page-background',
    '--card-surface',
    '--card-gradient',
    '--card-bg',
    '--bg-color',
    '--primary-color',
    '--secondary-color',
    '--accent-color-1',
    '--accent-color-2',
    '--accent-color-3',
    '--text-primary',
    '--text-secondary',
    '--logo-color',
    '--border-color',
    '--accent-shadow-1',
    '--accent-shadow-2'
  ];

  const clearCustomVariables = () => {
    const root = document.documentElement;
    CUSTOM_VARIABLES.forEach(variable => {
      root.style.removeProperty(variable);
    });
  };

  const getThemeClasses = () =>
    Array.from(document.body.classList).filter(cls => cls.startsWith('theme-'));

  const resolveUserKey = () => {
    try {
      const user = localStorage.getItem('currentUser');
      if (user) {
        return `${STORAGE_KEY}_${user}`;
      }
    } catch (error) {
      console.warn('[ThemeManager] Failed to resolve user theme key', error);
    }
    return STORAGE_KEY;
  };

  const resolveAiKey = () => {
    try {
      const user = localStorage.getItem('currentUser');
      if (user) {
        return `${AI_STORAGE_KEY}_${user}`;
      }
    } catch (error) {
      console.warn('[ThemeManager] Failed to resolve user AI theme key', error);
    }
    return AI_STORAGE_KEY;
  };

  const apply = themeName => {
    const theme = themeName || DEFAULT_THEME;
    document.body.classList.remove(...getThemeClasses());
    clearCustomVariables();
    document.body.classList.add(theme);
  };

  const set = themeName => {
    const aiKey = resolveAiKey();
    const aiStored = localStorage.getItem(aiKey);
    if (aiStored && themeName !== 'theme-custom') {
      localStorage.removeItem(aiKey);
    }
    apply(themeName);
    localStorage.setItem(resolveUserKey(), themeName);
    highlightActiveButtons(themeName);
  };

  const highlightActiveButtons = themeName => {
    document
      .querySelectorAll('[data-theme-btn]')
      .forEach(btn => btn.classList.toggle('active', btn.dataset.themeBtn === themeName));
  };

  const initButtons = root => {
    const container = root || document;
    container.querySelectorAll('[data-theme-btn]').forEach(btn => {
      btn.addEventListener('click', () => set(btn.dataset.themeBtn));
    });
  };

  const init = () => {
    const saved =
      localStorage.getItem(resolveUserKey()) ||
      localStorage.getItem(STORAGE_KEY) ||
      DEFAULT_THEME;
    clearCustomVariables();
    apply(saved);
    highlightActiveButtons(saved);
    initButtons(document);
  };

  const getCurrent = () => {
    const classes = getThemeClasses();
    return classes.length ? classes[0] : DEFAULT_THEME;
  };

  return { init, initButtons, apply, set, getCurrent };
})();

document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();
});

