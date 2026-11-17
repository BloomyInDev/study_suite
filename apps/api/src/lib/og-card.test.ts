import { describe, expect, it } from 'vitest'
import { renderPng, resolveGroups } from './og-card.js'

const groups = [
    { id: 'a', internalName: 'BUT3-A', displayName: 'S5A' },
    { id: 'b', internalName: 'S1', displayName: null },
    { id: 'c', internalName: 'S2', displayName: '  ' },
]

describe('resolveGroups', () => {
    it('matches by scraped or display name, ignoring case and spaces', () => {
        expect(resolveGroups(' s1 , s5a', groups)).toEqual([
            { id: 'b', label: 'S1' },
            { id: 'a', label: 'S5A' },
        ])
        expect(resolveGroups('but3-a', groups)).toEqual([{ id: 'a', label: 'S5A' }])
    })

    it('labels a blank display name by its scraped name', () => {
        expect(resolveGroups('S2', groups)).toEqual([{ id: 'c', label: 'S2' }])
    })

    it('drops unknown names and duplicates, so the url never reaches the card', () => {
        expect(resolveGroups('nope,"><script>,S1,s1,BUT3-A,S5A', groups)).toEqual([
            { id: 'b', label: 'S1' },
            { id: 'a', label: 'S5A' },
        ])
        expect(resolveGroups('', groups)).toEqual([])
    })
})

describe('renderPng', () => {
    it('renders a PNG at the asked width', async () => {
        const png = await renderPng(
            '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"><text y="10">x</text></svg>',
            40,
        )
        expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        // IHDR: width then height, big-endian, from byte 16.
        const view = new DataView(png.buffer)
        expect([view.getUint32(16), view.getUint32(20)]).toEqual([40, 80])
    })
})
