export enum AdminTabRoute {
  Search = "admin-search",
  Events = "admin-events",
  Users = "users",
  Profile = "admin-profile",
}

export const ADMIN_MAIN_TAB_ROUTES = [
  AdminTabRoute.Search,
  AdminTabRoute.Events,
  AdminTabRoute.Users,
  AdminTabRoute.Profile,
] as const;

export const isAdminMainTabRoute = (routeName: string) =>
  ADMIN_MAIN_TAB_ROUTES.includes(routeName as (typeof ADMIN_MAIN_TAB_ROUTES)[number]);
