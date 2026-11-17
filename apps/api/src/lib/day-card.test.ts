import { describe, expect, it } from 'vitest'
import { parisDate } from '@studysuite/shared/time'
import {
    clip,
    dayCardSvg,
    dayTitle,
    headline,
    hourRange,
    placeEvents,
    type CardEvent,
} from './day-card.js'

/** A course on Tuesday 17 November 2026, between two Paris hours. */
const course = (start: number, end: number, extra: Partial<CardEvent> = {}): CardEvent => ({
    title: 'Maths',
    start: parisDate(2026, 11, 17, Math.floor(start), (start % 1) * 60),
    end: parisDate(2026, 11, 17, Math.floor(end), (end % 1) * 60),
    color: '#6666ff',
    teachers: ['Ada LOVELACE'],
    rooms: ['K039'],
    ...extra,
})

const day = parisDate(2026, 11, 17)

describe('dayTitle', () => {
    it('names the Paris day in French, capitalised', () => {
        expect(dayTitle(day)).toBe('Mardi 17 novembre')
        // 23h30 UTC on the 16th is already the 17th in Paris.
        expect(dayTitle(new Date('2026-11-16T23:30:00Z'))).toBe('Mardi 17 novembre')
    })
})

describe('hourRange', () => {
    it('spans 8h to 20h by default', () => {
        expect(hourRange([course(10, 12)])).toEqual({ first: 8, last: 20 })
    })

    it('widens to a course outside it', () => {
        expect(hourRange([course(7.5, 9), course(19, 20.25)])).toEqual({ first: 7, last: 21 })
    })
})

describe('placeEvents', () => {
    it('keeps courses that do not overlap at full width', () => {
        const placed = placeEvents([course(8, 10), course(10, 12)])
        expect(placed.map((p) => [p.column, p.columns])).toEqual([
            [0, 1],
            [0, 1],
        ])
    })

    it('puts overlapping courses side by side, and reuses a freed column', () => {
        // 8-10 and 9-11 overlap; 10-12 starts when the first is over.
        const placed = placeEvents([course(8, 10), course(9, 11), course(10, 12)])
        expect(placed.map((p) => [p.column, p.columns])).toEqual([
            [0, 2],
            [1, 2],
            [0, 2],
        ])
    })
})

describe('headline', () => {
    it('lists up to three groups and counts the rest', () => {
        expect(headline(['S1'])).toBe('S1')
        expect(headline(['S1', 'S2', 'S3', 'S4', 'S5'])).toBe('S1, S2, S3 +2')
    })
})

describe('clip', () => {
    it('leaves text that fits and cuts what does not', () => {
        expect(clip('K039', 200, 12)).toBe('K039')
        const cut = clip('Irene LARRAMENDY VALVERDE', 100, 12)
        expect(cut.endsWith('…')).toBe(true)
        expect(cut.length).toBeLessThan('Irene LARRAMENDY VALVERDE'.length)
    })
})

describe('dayCardSvg', () => {
    it('draws each course with its Paris times, title and details', () => {
        const svg = dayCardSvg({ labels: ['S5A'], day, events: [course(8, 10)] })
        expect(svg).toContain('Planning S5A')
        expect(svg).toContain('Mardi 17 novembre')
        expect(svg).toContain('08:00 - 10:00')
        expect(svg).toContain('Ada LOVELACE')
        expect(svg).toContain('K039')
        expect(svg).toContain('fill="#6666ff"')
    })

    it('drops the detail lines a short course has no room for', () => {
        const svg = dayCardSvg({ labels: ['S5A'], day, events: [course(17.5, 18)] })
        expect(svg).toContain('17:30 - 18:00')
        expect(svg).not.toContain('K039')
    })

    it('says so on a day with no course', () => {
        const svg = dayCardSvg({ labels: ['S5A'], day, events: [] })
        expect(svg).toContain('Pas de cours ce jour-là')
    })

    it('falls back to the primary colour and escapes what it prints', () => {
        const svg = dayCardSvg({
            labels: ['A&B'],
            day,
            events: [course(8, 10, { color: null, title: '<script>' })],
            host: 'study.example',
        })
        expect(svg).toContain('fill="#1867c0"')
        expect(svg).toContain('&#60;script&#62;')
        expect(svg).not.toContain('<script>')
        expect(svg).toContain('Planning A&#38;B')
        expect(svg).toContain('study.example')
    })
})
