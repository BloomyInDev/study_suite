/**
 * The metadata behind every page's title and og: tags.
 *
 * `usePageSeo` turns an entry into head tags; vite-ssg then renders those into
 * each route's static HTML file at build time, which is what a crawler reads.
 */

export const SITE_NAME = 'Study Suite'
export const DEFAULT_DESCRIPTION = "Emploi du temps, devoirs et salles de l'IUT."

export const OG_IMAGE_PATH = '/og-image.png'

export interface PageSeo {
    path: string
    /** Page name alone — the site name is appended. */
    title: string
    description?: string
    /** Auth and admin screens: nothing there is worth indexing. */
    noindex?: boolean
}

export const PAGES: PageSeo[] = [
    {
        path: '/',
        title: 'Accueil',
        description: "Ton prochain cours, tes devoirs et les salles libres, en un coup d'œil.",
    },
    {
        path: '/planning',
        title: 'Planning',
        description: "L'emploi du temps de ton groupe, semaine par semaine.",
    },
    {
        path: '/planning/compare',
        title: 'Comparer les plannings',
        description: 'Les emplois du temps de plusieurs groupes, côte à côte.',
    },
    {
        path: '/homework',
        title: 'Devoirs',
        description: 'Les devoirs à rendre pour ton groupe.',
        noindex: true,
    },
    {
        path: '/teachers',
        title: 'Enseignants',
        description: 'Les enseignants, leurs cours et leur disponibilité.',
        noindex: true,
    },
    {
        path: '/rooms',
        title: 'Salles',
        description: 'Les salles occupées et les salles libres, en direct.',
        noindex: true,
    },
    {
        path: '/profile',
        title: 'Profil',
        description: 'Ta classe, tes groupes et les préférences de ton compte.',
        noindex: true,
    },
    {
        path: '/login',
        title: 'Connexion',
        description: 'Connecte-toi avec Discord pour accéder à Study Suite.',
        noindex: true,
    },
    {
        path: '/pending',
        title: 'Compte en attente',
        description: "Ton compte attend la validation d'un administrateur.",
        noindex: true,
    },
    { path: '/auth/callback', title: 'Connexion en cours', noindex: true },
    { path: '/admin/groups', title: 'Groupes · Administration', noindex: true },
    { path: '/admin/users', title: 'Utilisateurs · Administration', noindex: true },
    { path: '/admin/discord-mappings', title: 'Rôles Discord · Administration', noindex: true },
]

/** An unlisted path is a route that does not exist: name it, index nothing. */
export function pageSeo(path: string): PageSeo {
    return PAGES.find((p) => p.path === path) ?? { path, title: SITE_NAME, noindex: true }
}

export function pageTitle(page: PageSeo): string {
    return page.title === SITE_NAME ? SITE_NAME : `${page.title} · ${SITE_NAME}`
}
