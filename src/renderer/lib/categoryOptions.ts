/** Color palette and icon keys offered when creating/editing a category.
 *  Icon keys must exist in `categoryIcon` (CategoryIcon falls back to wallet). */
export const CATEGORY_COLORS = [
  '#7AB890',
  '#6FA582',
  '#8AA8C7',
  '#6E9BC4',
  '#5FB0C9',
  '#6FA8B5',
  '#E0936A',
  '#E07365',
  '#D98AB0',
  '#B59ADB',
  '#8D7DC4',
  '#A07DC4',
  '#B58A6A',
  '#7E8AA0',
  '#6E6E78',
] as const;

export const CATEGORY_ICONS = [
  'wallet',
  'shop',
  'utensils',
  'car',
  'home',
  'plug',
  'plane',
  'health',
  'education',
  'shopping',
  'leisure',
  'tv',
  'work',
  'bank',
  'incoming',
  'transfer',
] as const;
