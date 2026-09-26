import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { AdeSession } from './login.js'
import {
    decodeTimetable,
    legendDates,
    legendsBody,
    projectWeeks,
    timetableBody,
} from './planning.js'

/** The first three events of a real week, every string they do not use blanked. */
const fixture = readFileSync(new URL('./__fixtures__/timetable-3.txt', import.meta.url), 'utf-8')

const session: AdeSession = {
    moduleBase: 'https://proseconsult.umontpellier.fr/direct/gwtdirectplanning/',
    pageUrl: '',
    cookie: '',
    connectionId: 'aDOUPhu',
    identifier: '',
    resources: [55871, 6730],
    displayConfName: 'Affichage_TE2_ETUD',
    days: [0, 1, 2, 3, 4, 5],
}

describe('request bodies', () => {
    // Byte for byte what the browser sent for week 6, resources cut to two. The
    // server rejects a body that is merely equivalent in a way GWT tolerates,
    // so this pins the string table's order as well as the values.
    it('builds getTimetable exactly as the GWT client does', () => {
        expect(timetableBody(session, 171, [6], 3773)).toBe(
            '7|0|13|https://proseconsult.umontpellier.fr/direct/gwtdirectplanning/|8830FFA0A2CBAF25FFF8C1E3EDA74E53|' +
                'com.adesoft.gwt.directplan.client.rpc.DirectPlanningPlanningServiceProxy|method10getTimetable|J|' +
                'com.adesoft.gwt.core.client.rpc.data.planning.PlanningSelection/927838067|I|Z|java.util.List|' +
                'java.util.ArrayList/4159755760|java.lang.Integer/3438268394|Cumul|Déplacement|' +
                '1|2|3|4|7|5|6|7|7|8|9|9|aDOUPhu|6|10|6|11|0|11|1|11|2|11|3|11|4|11|5|171|12|13|0|0|' +
                '10|2|11|55871|11|6730|10|1|11|6|3773|1970|1|10|0|10|0|',
        )
    })

    it('builds getLegends exactly as the GWT client does', () => {
        expect(legendsBody(session, 171, [6])).toBe(
            '7|0|14|https://proseconsult.umontpellier.fr/direct/gwtdirectplanning/|8830FFA0A2CBAF25FFF8C1E3EDA74E53|' +
                'com.adesoft.gwt.directplan.client.rpc.DirectPlanningPlanningServiceProxy|method6getLegends|J|' +
                'com.adesoft.gwt.core.client.rpc.data.planning.PlanningSelection/927838067|' +
                'com.extjs.gxt.ui.client.data.SortInfo/1143517771|java.util.List|java.util.ArrayList/4159755760|' +
                'java.lang.Integer/3438268394|Cumul|Déplacement|com.extjs.gxt.ui.client.Style$SortDir/3873584144|NAME|' +
                '1|2|3|4|4|5|6|7|8|aDOUPhu|6|9|6|10|0|10|1|10|2|10|3|10|4|10|5|171|11|12|0|0|' +
                '9|2|10|55871|10|6730|9|1|10|6|7|13|1|14|9|0|',
        )
    })
})

describe('decodeTimetable', () => {
    const events = decodeTimetable(fixture)

    it('reads every event and consumes the stream exactly', () => {
        expect(events).toHaveLength(3)
    })

    it('reads the lines, the colour and the box', () => {
        expect(events[0]).toEqual({
            eventId: 152199,
            lines: [
                'Gestion proj. orga.',
                'Cours en ligne (CEL) IUTMS',
                '',
                'CHOLLET   ANTOINE',
                'A1-Semestre-1',
                '08h00 - 09h30',
            ],
            // Stored blue-green-red; checked against the page's computed style.
            background: '#ffe045',
            left: 0,
            width: 179,
        })
        expect(events[2]!.lines).toEqual([
            'Soutien Initiation au dev',
            'K119',
            'Montpellier / IUT Montpellier - Sète : Site de Mtp / K / 1',
            'RIOS SOLIS   YASMIN AGUEDA',
            'S1',
            '13h15 - 14h15',
        ])
        expect(events[2]!.background).toBe('#00ff00')
    })

    it('fails loudly when the layout shifts instead of misreading every field', () => {
        // One token too many at the end of the stream.
        expect(() => decodeTimetable(fixture.replace('//OK[', '//OK[0,'))).toThrow(/layout changed/)
    })
})

describe('projectWeeks', () => {
    const week = (id: number, ms: number, label: string) => `{"${id}""${ms}""${label}""false"`
    // 17 Aug 2026 and the two weeks after it, at UTC midnight.
    const d = (n: number) => Date.UTC(2026, 7, 17) + n * 7 * 86_400_000

    it('keeps only the weeks grouped into the project, not the whole calendar', () => {
        const blob =
            '{"15""68"[2]{"1""00h00""00:00:00"' +
            `[3]${week(1, d(0), 'S34-17 août 26')}${week(2, d(1), 'S35-24 août 26')}${week(3, d(2), 'S36-31 août 26')}` +
            `[1]{"0""August 2026"[2]${week(1, d(0), 'S34-17 août 26')}${week(2, d(1), 'S35-24 août 26')}`
        expect(projectWeeks(blob)).toEqual([
            { index: 0, monday: new Date('2026-08-17T00:00:00Z') },
            { index: 1, monday: new Date('2026-08-24T00:00:00Z') },
        ])
    })

    it('lands on the Monday when the epoch is local midnight', () => {
        // 00:00 Paris in summer is 22:00 UTC on the Sunday.
        const sundayEvening = d(0) - 2 * 3_600_000
        const blob = `[1]${week(1, sundayEvening, 'S34-17 août 26')}[1]${week(1, sundayEvening, 'S34-17 août 26')}`
        expect(projectWeeks(blob)[0]!.monday).toEqual(new Date('2026-08-17T00:00:00Z'))
    })
})

describe('legendDates', () => {
    it('lists the day headers in column order', () => {
        const resp =
            '//OK[1,["S40-28 sept. 26","Lundi 28/09/2026","Mardi 29/09/2026","Samedi 03/10/2026","Lundi 05/10/2026"],0,7]'
        expect(legendDates(resp)).toEqual(['2026-09-28', '2026-09-29', '2026-10-03', '2026-10-05'])
    })
})
