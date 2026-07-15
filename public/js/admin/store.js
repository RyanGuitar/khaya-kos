// js/admin/store.js
// Holds the live product state in the browser. Seeded instantly from the
// JSON the server injected into index.html (window.__INITIAL_STATE__), then
// kept in sync by messages coming from sync.js.

function readInitialState() {
  if (window.__INITIAL_STATE__ && Array.isArray(window.__INITIAL_STATE__.categories)) {
    return window.__INITIAL_STATE__;
  }
  return { categories: [] };
}

export const store = {
  state: readInitialState(),

  getCategory(categoryId) {
    return this.state.categories.find((c) => c.id === categoryId) || null;
  },

  getItem(categoryId, itemId) {
    const category = this.getCategory(categoryId);
    if (!category) return null;
    return category.items.find((i) => i.id === itemId) || null;
  },

  replaceState(newState) {
    this.state = newState;
  },

  applyUpdate(categoryId, itemId, field, value) {
    const item = this.getItem(categoryId, itemId);
    if (item) item[field] = value;
  },

  applyAdd(categoryId, item) {
    const category = this.getCategory(categoryId);
    if (category) category.items.push(item);
  },

  applyRemove(categoryId, itemId) {
    const category = this.getCategory(categoryId);
    if (category) category.items = category.items.filter((i) => i.id !== itemId);
  },

  applyCategoryToggle(categoryId, isOpen) {
    const category = this.getCategory(categoryId);
    if (category) category.isOpen = isOpen;
  },

  applyCategoryVisibility(categoryId, isVisible) {
    const category = this.getCategory(categoryId);
    if (category) category.isVisible = Boolean(isVisible);
  },
};
