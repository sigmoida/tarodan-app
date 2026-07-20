export const ADMIN_LIST_DEFAULT_PAGE = 1;
export const ADMIN_LIST_DEFAULT_LIMIT = 20;
// Admin lists offer a "Show 20/50/100/250" page-size selector (epic #375), so the
// cap must allow 250; both the query DTO (@Max) and paginate()'s clamp read this.
export const ADMIN_LIST_MAX_LIMIT = 250;
