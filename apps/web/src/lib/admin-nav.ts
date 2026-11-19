/**
 * The admin pages, as the two menus the app bar shows in admin mode. Grouped by
 * what they touch: who someone is and which class they get, or the timetable
 * data itself.
 */
export interface AdminMenu {
    title: string
    icon: string
    items: { title: string; icon: string; to: string }[]
}

export function adminMenus(iutLabel: string): AdminMenu[] {
    return [
        {
            title: 'Comptes',
            icon: 'mdi-account-cog',
            items: [
                { title: 'Utilisateurs', icon: 'mdi-account-multiple', to: '/admin/users' },
                {
                    title: 'Liaisons Discord',
                    icon: 'fa:fab fa-discord',
                    to: '/admin/discord-mappings',
                },
                { title: `Liaisons ${iutLabel}`, icon: 'mdi-school', to: '/admin/iut-mappings' },
            ],
        },
        {
            title: 'Planning',
            icon: 'mdi-calendar-edit',
            items: [
                { title: 'Groupes', icon: 'mdi-sitemap', to: '/admin/groups' },
                { title: 'Changements', icon: 'mdi-history', to: '/admin/changes' },
            ],
        },
    ]
}
