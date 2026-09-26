import { describe, expect, it } from 'vitest'

import { GwtReader, parseResponse } from './gwt.js'

describe('parseResponse', () => {
    it('reads the stream back to front and splits off the string table', () => {
        const { stream, strings } = parseResponse('//OK[3,2,1,["a","b"],0,7]')
        expect(stream).toEqual([1, 2, 3])
        expect(strings).toEqual(['a', 'b'])
    })

    // GWT emits JavaScript, not JSON. Each of these made JSON.parse throw on a
    // real ADE response.
    it('decodes \\x escapes, including two in a row', () => {
        const { strings } = parseResponse(String.raw`//OK[1,["d\x27\x27une","a\\x27b"],0,7]`)
        expect(strings).toEqual(["d''une", String.raw`a\x27b`])
    })

    it('joins a string split as "…"+"…" but not an escaped quote-plus-quote', () => {
        const { strings } = parseResponse(String.raw`//OK[1,["sp"+"lit","q\"+\"r"],0,7]`)
        expect(strings).toEqual(['split', 'q"+"r'])
    })

    it('flattens a payload chunked as [..].concat([..],[..])', () => {
        const { stream, strings } = parseResponse('//OK[5,4].concat([3,2],[1,["s"],0,7])')
        expect(stream).toEqual([1, 2, 3, 4, 5])
        expect(strings).toEqual(['s'])
    })

    it('throws on an exception rather than reading it as an empty answer', () => {
        expect(() =>
            parseResponse('//EX[2,1,["java.lang.ArrayIndexOutOfBoundsException"],0,7]'),
        ).toThrow(/ADE RPC failed/)
    })
})

describe('GwtReader', () => {
    it('resolves a back-reference to a boxed value to the value itself', () => {
        // ArrayList(3) of Integer(42), then two back-references to that Integer
        // (object #2; the list itself is #1).
        const strings = ['java.util.ArrayList/4159755760', 'java.lang.Integer/3438268394']
        const r = new GwtReader([1, 3, 2, 42, -2, -2], strings, {})
        expect(r.object()).toEqual([42, 42, 42])
        expect(r.done).toBe(true)
    })

    it('fails loudly on a class it cannot read', () => {
        const r = new GwtReader([1], ['com.example.Unknown/1'], {})
        expect(() => r.object()).toThrow(/Unknown GWT type com.example.Unknown/)
    })
})
