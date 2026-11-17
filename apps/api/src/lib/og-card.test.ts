import { describe, expect, it } from 'vitest'
import { fitText, groupLabels, headline, planningCardSvg, renderPlanningCard } from './og-card.js'

const groups = [
    { internalName: 'BUT3-A', displayName: 'S5A' },
    { internalName: 'S1', displayName: null },
    { internalName: 'S2', displayName: '  ' },
]

describe('groupLabels', () => {
    it('matches by scraped or display name, ignoring case and spaces', () => {
        expect(groupLabels(' s1 , s5a', groups)).toEqual(['S1', 'S5A'])
        expect(groupLabels('but3-a', groups)).toEqual(['S5A'])
    })

    it('labels a blank display name by its scraped name', () => {
        expect(groupLabels('S2', groups)).toEqual(['S2'])
    })

    it('drops unknown names and duplicates, so the url never reaches the card', () => {
        expect(groupLabels('nope,"><script>,S1,s1,BUT3-A,S5A', groups)).toEqual(['S1', 'S5A'])
        expect(groupLabels('', groups)).toEqual([])
    })
})

describe('headline', () => {
    it('lists up to three groups and counts the rest', () => {
        expect(headline(['S1'])).toBe('S1')
        expect(headline(['S1', 'S2', 'S3'])).toBe('S1, S2, S3')
        expect(headline(['S1', 'S2', 'S3', 'S4', 'S5'])).toBe('S1, S2, S3 +2')
    })
})

describe('fitText', () => {
    it('keeps a short name at the largest size', () => {
        expect(fitText('S1')).toEqual({ text: 'S1', size: 96 })
    })

    it('shrinks a longer name to fit', () => {
        const { text, size } = fitText('BUT3-A, BUT3-B')
        expect(text).toBe('BUT3-A, BUT3-B')
        expect(size).toBeLessThan(96)
        expect(size).toBeGreaterThanOrEqual(44)
    })

    it('cuts what does not fit even at the smallest size', () => {
        const { text, size } = fitText('x'.repeat(80))
        expect(size).toBe(44)
        expect(text.endsWith('…')).toBe(true)
        expect(text.length).toBeLessThan(80)
    })
})

describe('planningCardSvg', () => {
    it('escapes the label', () => {
        const svg = planningCardSvg(['A&B <C>'])
        expect(svg).toContain('A&#38;B &#60;C&#62;')
        expect(svg).not.toContain('<C>')
    })
})

describe('renderPlanningCard', () => {
    it('renders a PNG', async () => {
        const png = await renderPlanningCard(['S1'])
        expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    })
})
